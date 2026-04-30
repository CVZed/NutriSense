"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import LogEntryCard from "@/components/chat/LogEntryCard";
import type { Database } from "@/types/database";

type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];

interface Props {
  entries: LogEntry[];
  goals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  bmr: number;
  windowStartIso: string;
  nowIso: string;
  todayLabel: string;
}

// ── SVG layout ────────────────────────────────────────────────────────────────
const VW = 480, VH = 230;
const PL = 48, PR = 16;
const IW = VW - PL - PR;                // 416

// Ribbon strip (sleep shading + event dots) at the top
const RIB_Y = 6, RIB_H = 22;
const DOT_CY = RIB_Y + RIB_H / 2;      // 17
const DOT_R = 4;

// Calorie chart area (below ribbon)
const CHT_TOP = RIB_Y + RIB_H + 10;    // 38
const CHT_BOT = VH - 34;               // 196
const CHT_H = CHT_BOT - CHT_TOP;       // 158
const LABEL_Y = VH - 8;                // 222

// ── Coordinate helpers ────────────────────────────────────────────────────────
const tX = (ms: number, total: number) => PL + (ms / total) * IW;
const cY = (cal: number, max: number) => CHT_BOT - (cal / max) * CHT_H;
const ptsStr = (arr: [number, number][], total: number, max: number) =>
  arr.map(([t, c]) => `${tX(t, total).toFixed(1)},${cY(c, max).toFixed(1)}`).join(" ");
const xToMs = (svgX: number, total: number) =>
  Math.max(0, Math.min(total, ((svgX - PL) / IW) * total));

// ── Entry colours / icons ─────────────────────────────────────────────────────
const ENTRY_COLOR: Record<string, string> = {
  food: "#22c55e", drink: "#22c55e",
  exercise: "#3b82f6",
  symptom: "#f97316",
  mood: "#eab308",
  note: "#9ca3af",
};
const ENTRY_ICON: Record<string, string> = {
  food: "🥗", drink: "☕", exercise: "💪",
  sleep: "😴", symptom: "🩺", mood: "😊", note: "📝",
};

// ── Calorie lookup helpers ─────────────────────────────────────────────────────
/** Step-function lookup: returns the last value whose time ≤ ms */
function stepAt(ms: number, pts: [number, number][]): number {
  let v = 0;
  for (const [t, c] of pts) { if (t <= ms) v = c; else break; }
  return v;
}

// ── Calorie ring ──────────────────────────────────────────────────────────────
function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const r = 52, circ = 2 * Math.PI * r;
  const pct = Math.min(consumed / (goal || 1), 1);
  const over = consumed > goal;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0">
      <svg width="124" height="124" className="-rotate-90" aria-hidden>
        <circle cx="62" cy="62" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
        <circle cx="62" cy="62" r={r} fill="none"
          stroke={over ? "#ef4444" : "#22c55e"} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute text-center pointer-events-none">
        <p className="text-xl font-bold text-gray-900 leading-none">{Math.round(consumed).toLocaleString()}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">of {goal.toLocaleString()}</p>
        <p className={`text-[10px] font-semibold mt-0.5 ${over ? "text-red-500" : "text-green-600"}`}>
          {over ? `+${Math.round(consumed - goal)} over` : `${Math.round(goal - consumed)} left`}
        </p>
      </div>
    </div>
  );
}

// ── Macro bar ─────────────────────────────────────────────────────────────────
function MacroBar({ label, consumed, goal, color }: { label: string; consumed: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0;
  const over = consumed > goal;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className={over ? "text-red-500 font-semibold" : "text-gray-700 font-semibold"}>
          {Math.round(consumed)}g <span className="text-gray-400 font-normal">/ {goal}g</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${over ? "bg-red-400" : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Legend pill ───────────────────────────────────────────────────────────────
function LegendIcon({ type }: { type: string }) {
  const icon = ENTRY_ICON[type] ?? "📝";
  const color = type === "sleep" ? "#818cf8" : (ENTRY_COLOR[type] ?? "#9ca3af");
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shadow-sm border border-white"
        style={{ backgroundColor: color + "22", border: `1.5px solid ${color}40` }}>
        <span style={{ filter: "none" }}>{icon}</span>
      </div>
      <span className="text-[9px] text-gray-400 capitalize font-medium">{type}</span>
    </div>
  );
}

// ── Meal clustering ───────────────────────────────────────────────────────────
const MEAL_GAP_MS = 90 * 60 * 1000; // 90 min gap → new meal

function getMealLabel(hour: number): { name: string; emoji: string } {
  if (hour >= 5  && hour < 10) return { name: "Breakfast",       emoji: "🌅" };
  if (hour >= 10 && hour < 12) return { name: "Brunch",          emoji: "🍳" };
  if (hour >= 12 && hour < 15) return { name: "Lunch",           emoji: "☀️" };
  if (hour >= 15 && hour < 18) return { name: "Snack",           emoji: "🍎" };
  if (hour >= 18 && hour < 21) return { name: "Dinner",          emoji: "🌙" };
  return                               { name: "Late Night Snack", emoji: "🌃" };
}

interface MealCluster {
  id: string;
  name: string;
  emoji: string;
  startTime: string;
  entries: LogEntry[];
  totalCal: number;
}

function clusterMeals(src: LogEntry[], tz: string): MealCluster[] {
  const food = [...src]
    .filter(e => e.entry_type === "food" || e.entry_type === "drink")
    .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
  if (!food.length) return [];

  const groups: LogEntry[][] = [[food[0]]];
  for (let i = 1; i < food.length; i++) {
    const gap = new Date(food[i].logged_at).getTime() - new Date(food[i - 1].logged_at).getTime();
    if (gap > MEAL_GAP_MS) groups.push([food[i]]);
    else groups[groups.length - 1].push(food[i]);
  }

  return groups.map((entries, idx) => {
    const localDate = new Date(new Date(entries[0].logged_at).toLocaleString("en-US", { timeZone: tz }));
    const { name, emoji } = getMealLabel(localDate.getHours());
    const totalCal = entries.reduce((s, e) => {
      const sd = (e.structured_data ?? {}) as Record<string, number>;
      return s + (Number(sd.calories) || 0);
    }, 0);
    return { id: `meal-${idx}-${entries[0].id}`, name, emoji, startTime: entries[0].logged_at, entries, totalCal };
  });
}

// ── Entry group header ────────────────────────────────────────────────────────
// Food/drink removed — they're shown as meal clusters
const GROUP_ORDER = ["exercise", "sleep", "symptom", "mood", "note"];
const GROUP_LABELS: Record<string, string> = {
  exercise: "Exercise", sleep: "Sleep", symptom: "Symptoms", mood: "Mood", note: "Notes",
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

/** Top-level date divider — "Today" or "Yesterday" */
function DateBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-0.5">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ── Main timeline chart ────────────────────────────────────────────────────────
function TimelineChart({
  consumedPts, bmr, exercisePts, maxCal, totalMs, windowStartMs,
  sleepBands, dots,
}: {
  consumedPts: [number, number][];
  bmr: number;
  exercisePts: [number, number][]; // step fn: starts at [wakeOffset, bmr], steps up by burned cal
  maxCal: number;
  totalMs: number;
  windowStartMs: number;
  sleepBands: { startOffset: number; endOffset: number }[];
  dots: { offsetMs: number; type: string }[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VW;
    if (svgX >= PL && svgX <= PL + IW) {
      setHoverMs(xToMs(svgX, totalMs));
    } else {
      setHoverMs(null);
    }
  }

  // Build local-time 4-hour axis labels
  const timeLabels = useMemo(() => {
    const H4 = 4 * 60 * 60 * 1000;
    const labels: { offset: number; label: string }[] = [];
    const anchor = new Date(windowStartMs);
    anchor.setHours(0, 0, 0, 0);
    let t = anchor.getTime();
    while (t <= windowStartMs + totalMs + H4) {
      const offset = t - windowStartMs;
      if (offset >= -H4 / 2 && offset <= totalMs + 1000) {
        labels.push({
          offset: Math.max(0, Math.min(totalMs, offset)),
          label: new Date(t).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        });
      }
      t += H4;
    }
    return labels;
  }, [windowStartMs, totalMs]);

  // Y-axis labels (round numbers, skip any that are too close to the BMR line)
  const yLabels = useMemo(() => {
    const step = maxCal > 3000 ? 1000 : maxCal > 1500 ? 500 : 250;
    const labels: number[] = [];
    for (let c = 0; c <= maxCal; c += step) {
      // Skip gridline if it would collide with the BMR label (within ±8% of chart height)
      if (bmr > 0 && Math.abs(c - bmr) / maxCal < 0.06) continue;
      labels.push(c);
    }
    return labels;
  }, [maxCal, bmr]);

  // Hover values
  const hasBmr = bmr > 0;
  const hasExercise = exercisePts.length > 1;
  const hoverConsumed = hoverMs != null ? stepAt(hoverMs, consumedPts) : null;
  // Total burned at hover point = last exercisePts value at or before hoverMs
  const hoverTotalBurned = hoverMs != null && hasExercise ? stepAt(hoverMs, exercisePts) : null;
  const hoverExerciseBurned = hoverTotalBurned != null ? Math.max(0, hoverTotalBurned - bmr) : null;
  const hoverTime = hoverMs != null
    ? new Date(windowStartMs + hoverMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  // Tooltip layout: time + consumed row + (optional) BMR row + (optional) exercise row
  const tooltipRows = 1 + 1 + (hasBmr ? 1 : 0) + (hasExercise ? 1 : 0);
  const tooltipH = 12 + tooltipRows * 18;

  const tooltipX = hoverMs != null
    ? (tX(hoverMs, totalMs) > VW - PL - 150 ? tX(hoverMs, totalMs) - 148 : tX(hoverMs, totalMs) + 10)
    : 0;
  const tooltipY = CHT_TOP + 10;

  // BMR flat line Y position
  const bmrY = hasBmr ? cY(bmr, maxCal) : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverMs(null)}
        style={{ cursor: "crosshair", display: "block" }}
      >
        {/* ── Ribbon: sleep bands + event dots ── */}
        <rect x={PL} y={RIB_Y} width={IW} height={RIB_H} rx="4" fill="#f1f5f9" />

        {sleepBands.map((b, i) => {
          const x = tX(b.startOffset, totalMs);
          const w = tX(b.endOffset, totalMs) - x;
          return w > 0 ? (
            <rect key={i} x={x} y={RIB_Y} width={w} height={RIB_H} fill="#818cf8" opacity="0.4" rx="3" />
          ) : null;
        })}

        {dots.map((d, i) => (
          <circle key={i}
            cx={tX(d.offsetMs, totalMs)} cy={DOT_CY} r={DOT_R}
            fill={ENTRY_COLOR[d.type] ?? "#9ca3af"} opacity="0.9"
          />
        ))}

        {/* ── Chart area ── */}
        {/* Horizontal gridlines + y-axis labels */}
        {yLabels.map((cal) => {
          const y = cY(cal, maxCal);
          return (
            <g key={cal}>
              <line x1={PL} y1={y} x2={PL + IW} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PL - 6} y={y + 3.5} textAnchor="end" fontSize="9" fill="#d1d5db" fontFamily="system-ui,sans-serif">
                {cal >= 1000 ? `${cal / 1000}k` : cal}
              </text>
            </g>
          );
        })}

        <line x1={PL} y1={CHT_BOT} x2={PL + IW} y2={CHT_BOT} stroke="#e5e7eb" strokeWidth="1" />

        {/* ── BMR flat reference line ── */}
        {hasBmr && (
          <g>
            <line
              x1={PL} y1={bmrY} x2={PL + IW} y2={bmrY}
              stroke="#fdba74" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.9"
            />
            {/* "BMR" label on left axis, orange to distinguish from gridlines */}
            <text x={PL - 6} y={bmrY + 3.5} textAnchor="end" fontSize="8.5" fontWeight="600"
              fill="#f97316" fontFamily="system-ui,sans-serif" opacity="0.85">
              BMR
            </text>
          </g>
        )}

        {/* ── Exercise step line (starts at wake time, sits above BMR) ── */}
        {hasExercise && (
          <polyline
            points={ptsStr(exercisePts, totalMs, maxCal)}
            fill="none" stroke="#f97316" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* ── Consumed step line ── */}
        <polyline
          points={ptsStr(consumedPts, totalMs, maxCal)}
          fill="none" stroke="#22c55e" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* "Now" dashed vertical */}
        <line
          x1={tX(totalMs, totalMs)} y1={RIB_Y}
          x2={tX(totalMs, totalMs)} y2={CHT_BOT}
          stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3"
        />
        <text x={tX(totalMs, totalMs) - 2} y={LABEL_Y} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="system-ui,sans-serif">
          Now
        </text>

        {/* X-axis time labels */}
        {timeLabels.map(({ offset, label }, i) => {
          const x = tX(offset, totalMs);
          if (x > tX(totalMs, totalMs) - 30) return null;
          return (
            <text key={i} x={x} y={LABEL_Y} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="system-ui,sans-serif">
              {label}
            </text>
          );
        })}

        {/* ── Hover cursor + tooltip ── */}
        {hoverMs != null && (
          <g>
            <line
              x1={tX(hoverMs, totalMs)} y1={RIB_Y}
              x2={tX(hoverMs, totalMs)} y2={CHT_BOT}
              stroke="#64748b" strokeWidth="1" strokeDasharray="3,2" opacity="0.6"
            />
            <g transform={`translate(${tooltipX},${tooltipY})`}>
              <rect width="148" height={tooltipH} rx="8" fill="white"
                stroke="#e2e8f0" strokeWidth="1"
                style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.10))" }}
              />
              {/* Time */}
              <text x="10" y="16" fontSize="10" fontWeight="600" fill="#374151" fontFamily="system-ui,sans-serif">
                {hoverTime}
              </text>
              {/* Consumed */}
              <circle cx="10" cy="30" r="4" fill="#22c55e" />
              <text x="19" y="34" fontSize="9.5" fill="#22c55e" fontWeight="600" fontFamily="system-ui,sans-serif">
                Consumed: {Math.round(hoverConsumed ?? 0)} cal
              </text>
              {/* BMR (static) */}
              {hasBmr && (
                <>
                  <line x1="7" y1="47" x2="14" y2="47" stroke="#fdba74" strokeWidth="1.5" strokeDasharray="3,2" />
                  <text x="19" y="51" fontSize="9.5" fill="#fb923c" fontWeight="600" fontFamily="system-ui,sans-serif">
                    BMR: {Math.round(bmr)} cal
                  </text>
                </>
              )}
              {/* Exercise burned */}
              {hasExercise && hoverExerciseBurned != null && (
                <>
                  <circle cx="10" cy={hasBmr ? 65 : 47} r="4" fill="#f97316" />
                  <text x="19" y={hasBmr ? 69 : 51} fontSize="9.5" fill="#f97316" fontWeight="600" fontFamily="system-ui,sans-serif">
                    Exercise: +{Math.round(hoverExerciseBurned)} cal
                  </text>
                </>
              )}
            </g>
          </g>
        )}
      </svg>

      {/* Icon legend */}
      <div className="flex justify-center gap-5 pt-1 pb-2 flex-wrap">
        {["food", "sleep", "exercise", "symptom", "mood"].map(type => (
          <LegendIcon key={type} type={type} />
        ))}
      </div>
    </div>
  );
}

// ── Meal section ─────────────────────────────────────────────────────────────
function MealSection({
  meal,
  onDelete,
  onEdit,
}: {
  meal: MealCluster;
  onDelete: (id: string) => void;
  onEdit: (id: string, updated: Record<string, unknown>, newLoggedAt?: string) => void;
}) {
  const timeStr = new Date(meal.startTime).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div className="mt-2">
      {/* Meal header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        <span className="text-base leading-none">{meal.emoji}</span>
        <span className="text-xs font-semibold text-gray-700">{meal.name}</span>
        <span className="text-[10px] text-gray-400">{timeStr}</span>
        <div className="flex-1 h-px bg-gray-100" />
        {meal.totalCal > 0 && (
          <span className="text-[10px] font-semibold text-green-600 flex-shrink-0">
            {Math.round(meal.totalCal)} cal
          </span>
        )}
      </div>

      {/* Entries inside this meal */}
      <div className="px-4 space-y-2">
        {meal.entries.map((entry) => (
          <LogEntryCard
            key={entry.id}
            entryType={entry.entry_type}
            data={{
              entry_id: entry.id,
              raw_image_url: entry.raw_image_url,
              ...(entry.structured_data as Record<string, unknown>),
            }}
            loggedAt={entry.logged_at}
            onDelete={() => onDelete(entry.id)}
            onEdit={(updated, newLoggedAt) => onEdit(entry.id, updated, newLoggedAt)}
            swipeable
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TodayClient({
  entries: initialEntries, goals, bmr, windowStartIso, nowIso, todayLabel,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);

  // Refresh server data every time this tab is visited
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { router.refresh(); }, []);

  // Sync local state when server re-renders with fresh data
  useEffect(() => { setEntries(initialEntries); }, [initialEntries]);

  const windowStartMs = useMemo(() => new Date(windowStartIso).getTime(), [windowStartIso]);
  const nowMs = useMemo(() => new Date(nowIso).getTime(), [nowIso]);
  const totalMs = nowMs - windowStartMs;

  // Local midnight — splits "today" from "yesterday" within the 24h window
  const todayStartMs = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
  }, []);

  // Entries from each day within the rolling window
  const todayEntries    = useMemo(() => entries.filter(e => new Date(e.logged_at).getTime() >= todayStartMs), [entries, todayStartMs]);
  const yesterdayEntries = useMemo(() => entries.filter(e => new Date(e.logged_at).getTime() <  todayStartMs), [entries, todayStartMs]);

  // Calorie ring + macros reflect TODAY only (the actionable daily goal)
  const todayTotals = useMemo(() =>
    todayEntries
      .filter(e => e.entry_type === "food" || e.entry_type === "drink")
      .reduce((acc, e) => {
        const d = e.structured_data as Record<string, number>;
        return {
          calories:  acc.calories  + (d.calories  ?? 0),
          protein_g: acc.protein_g + (d.protein_g ?? 0),
          carbs_g:   acc.carbs_g   + (d.carbs_g   ?? 0),
          fat_g:     acc.fat_g     + (d.fat_g     ?? 0),
        };
      }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }),
    [todayEntries]
  );

  // Sleep bands on ribbon
  const sleepBands = useMemo(() =>
    entries
      .filter(e => e.entry_type === "sleep")
      .map(e => {
        const sd = e.structured_data as Record<string, unknown>;
        const loggedMs = new Date(e.logged_at).getTime();
        const durationMs = Number(sd.duration_min ?? 0) * 60 * 1000;
        const startMs = sd.start_time ? new Date(String(sd.start_time)).getTime() : loggedMs - durationMs;
        const endMs = sd.end_time ? new Date(String(sd.end_time)).getTime() : loggedMs;
        return {
          startOffset: Math.max(startMs - windowStartMs, 0),
          endOffset: Math.min(endMs - windowStartMs, totalMs),
        };
      })
      .filter(b => b.endOffset > b.startOffset),
    [entries, windowStartMs, totalMs]
  );

  // Event dots
  const dots = useMemo(() =>
    entries
      .filter(e => e.entry_type !== "sleep")
      .map(e => ({ offsetMs: new Date(e.logged_at).getTime() - windowStartMs, type: e.entry_type }))
      .filter(d => d.offsetMs >= 0 && d.offsetMs <= totalMs),
    [entries, windowStartMs, totalMs]
  );

  // Consumed step-function points — resets to 0 at midnight
  const consumedPts = useMemo<[number, number][]>(() => {
    const midnightOffset = Math.max(0, Math.min(totalMs, todayStartMs - windowStartMs));
    const food = entries
      .filter(e => e.entry_type === "food" || e.entry_type === "drink")
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
    const pts: [number, number][] = [[0, 0]];
    let cum = 0;
    let midnightInserted = false;
    for (const e of food) {
      const t = new Date(e.logged_at).getTime() - windowStartMs;
      if (t < 0 || t > totalMs) continue;
      // Drop to 0 at midnight before the first today entry
      if (!midnightInserted && t >= midnightOffset) {
        pts.push([midnightOffset, cum]); // hold yesterday's total up to midnight
        pts.push([midnightOffset, 0]);   // reset
        cum = 0;
        midnightInserted = true;
      }
      const cal = Number((e.structured_data as Record<string, number>).calories ?? 0);
      if (cal === 0) continue;
      pts.push([t, cum]);
      cum += cal;
      pts.push([t, cum]);
    }
    // Ensure reset is inserted even if there are no today entries
    if (!midnightInserted && midnightOffset < totalMs) {
      pts.push([midnightOffset, cum]);
      pts.push([midnightOffset, 0]);
      cum = 0;
    }
    pts.push([totalMs, cum]);
    return pts;
  }, [entries, windowStartMs, totalMs, todayStartMs]);

  // Wake time offset — end of the most recent sleep entry in the window (kept for future use).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const wakeTimeOffset = useMemo(() => {
    const sleepEntries = entries
      .filter(e => e.entry_type === "sleep")
      .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
    for (const s of sleepEntries) {
      const sd = s.structured_data as Record<string, unknown>;
      const endMs = sd.end_time
        ? new Date(String(sd.end_time)).getTime()
        : new Date(s.logged_at).getTime();
      const offset = endMs - windowStartMs;
      if (offset >= 0 && offset <= totalMs) return offset;
    }
    // No sleep entry found — use local midnight as the day boundary
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return Math.max(0, Math.min(totalMs, midnight.getTime() - windowStartMs));
  }, [entries, windowStartMs, totalMs]);

  // Exercise step line: starts at window start with BMR baseline, steps up with each
  // exercise entry across the full 24h window, resets the exercise portion at midnight.
  const exercisePts = useMemo<[number, number][]>(() => {
    if (bmr === 0) return [];
    const midnightOffset = Math.max(0, Math.min(totalMs, todayStartMs - windowStartMs));
    const exercises = entries
      .filter(e => e.entry_type === "exercise")
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
    // Start at the beginning of the 24h window at the BMR baseline
    const pts: [number, number][] = [[0, bmr]];
    let cumBurned = 0;
    let midnightInserted = false;
    for (const e of exercises) {
      const t = new Date(e.logged_at).getTime() - windowStartMs;
      if (t < 0 || t > totalMs) continue;
      // Drop exercise portion back to 0 (line returns to bmr) at midnight
      if (!midnightInserted && t >= midnightOffset) {
        pts.push([midnightOffset, bmr + cumBurned]); // hold yesterday's total up to midnight
        pts.push([midnightOffset, bmr]);              // reset — exercise portion back to 0
        cumBurned = 0;
        midnightInserted = true;
      }
      const burned = Number((e.structured_data as Record<string, number>).calories_burned_est ?? 0);
      if (burned === 0) continue;
      pts.push([t, bmr + cumBurned]);
      cumBurned += burned;
      pts.push([t, bmr + cumBurned]);
    }
    if (!midnightInserted && midnightOffset > 0 && midnightOffset < totalMs) {
      pts.push([midnightOffset, bmr + cumBurned]);
      pts.push([midnightOffset, bmr]);
      cumBurned = 0;
    }
    pts.push([totalMs, bmr + cumBurned]);
    return pts;
  }, [entries, bmr, windowStartMs, totalMs, todayStartMs]);

  const maxCal = useMemo(() => {
    const c = consumedPts[consumedPts.length - 1]?.[1] ?? 0;
    const ex = exercisePts[exercisePts.length - 1]?.[1] ?? 0;
    return Math.max(c, ex, bmr, goals.calories, 400) * 1.15;
  }, [consumedPts, exercisePts, bmr, goals.calories]);

  // Meal clusters (food + drink, time-proximity grouped) — use browser timezone
  const userTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const todayMeals     = useMemo(() => clusterMeals(todayEntries,     userTz), [todayEntries,     userTz]);
  const yesterdayMeals = useMemo(() => clusterMeals(yesterdayEntries, userTz), [yesterdayEntries, userTz]);

  // Non-food entries grouped by type (exercise, sleep, symptom, mood, note)
  const groupByType = (src: LogEntry[]) => {
    const desc = [...src].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
    return GROUP_ORDER.reduce<Record<string, LogEntry[]>>((acc, type) => {
      const g = desc.filter(e => e.entry_type === type);
      if (g.length) acc[type] = g;
      return acc;
    }, {});
  };

  const todayGrouped     = useMemo(() => groupByType(todayEntries),     [todayEntries]);
  const yesterdayGrouped = useMemo(() => groupByType(yesterdayEntries), [yesterdayEntries]);

  const handleDelete = (id: string) => setEntries(p => p.filter(e => e.id !== id));
  const handleEdit = (id: string, updated: Record<string, unknown>, newLoggedAt?: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEntries(p => p.map(e =>
      e.id === id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? ({ ...e, structured_data: updated as any, ...(newLoggedAt ? { logged_at: newLoggedAt } : {}) } as typeof e)
        : e
    ));

  return (
    <div className="h-full flex justify-center bg-gray-50">
      <div className="w-full md:max-w-2xl md:shadow-xl md:border-x md:border-gray-200 bg-gray-50 h-full flex flex-col">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Last 24 Hours</p>
          <p className="text-base font-semibold text-gray-900">{todayLabel}</p>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Nutrition summary — today only */}
          <div className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-3">Today&apos;s intake</p>
            <div className="flex items-center gap-4">
              <CalorieRing consumed={todayTotals.calories} goal={goals.calories} />
              <div className="flex-1 space-y-2.5 min-w-0">
                <MacroBar label="Protein" consumed={todayTotals.protein_g} goal={goals.protein_g} color="bg-blue-400" />
                <MacroBar label="Carbs"   consumed={todayTotals.carbs_g}   goal={goals.carbs_g}   color="bg-yellow-400" />
                <MacroBar label="Fat"     consumed={todayTotals.fat_g}     goal={goals.fat_g}     color="bg-orange-400" />
              </div>
            </div>
          </div>

          {/* Timeline chart — rolling 24 h */}
          <div className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 shadow-sm px-3 pt-3 pb-1">
            {/* Card header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last 24 Hours</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded bg-indigo-300 opacity-60" /><span className="text-[9px] text-gray-400">Sleep</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-0.5 rounded bg-green-400" /><span className="text-[9px] text-gray-400">Consumed</span></div>
                {bmr > 0 && (
                  <>
                    {/* Dashed swatch for BMR */}
                    <div className="flex items-center gap-1">
                      <svg width="12" height="6" viewBox="0 0 12 6"><line x1="0" y1="3" x2="12" y2="3" stroke="#fdba74" strokeWidth="1.5" strokeDasharray="3,2"/></svg>
                      <span className="text-[9px] text-gray-400">BMR</span>
                    </div>
                    {/* Solid swatch for exercise */}
                    <div className="flex items-center gap-1"><div className="w-3 h-0.5 rounded bg-orange-400" /><span className="text-[9px] text-gray-400">Exercise</span></div>
                  </>
                )}
              </div>
            </div>

            <TimelineChart
              consumedPts={consumedPts}
              bmr={bmr}
              exercisePts={exercisePts}
              maxCal={maxCal}
              totalMs={totalMs}
              windowStartMs={windowStartMs}
              sleepBands={sleepBands}
              dots={dots}
            />
          </div>

          {/* Entry list — split into Today / Yesterday */}
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <span className="text-2xl">🌱</span>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Nothing logged in the last 24 hours</p>
              <p className="text-xs text-gray-400">Head to Chat to start tracking.</p>
            </div>
          ) : (
            <div className="pb-6">
              {/* ── Today ── */}
              {(todayMeals.length > 0 || Object.keys(todayGrouped).length > 0) && (
                <>
                  <DateBanner label="Today" />

                  {/* Meal clusters (food + drink) */}
                  {todayMeals.map(meal => (
                    <MealSection
                      key={meal.id}
                      meal={meal}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                    />
                  ))}

                  {/* Non-food activity */}
                  {Object.entries(todayGrouped).map(([type, typeEntries]) => (
                    <div key={type}>
                      <SectionLabel label={GROUP_LABELS[type] ?? type} />
                      <div className="px-4 space-y-2 mt-1">
                        {typeEntries.map((entry) => (
                          <LogEntryCard
                            key={entry.id}
                            entryType={entry.entry_type}
                            data={{ entry_id: entry.id, raw_image_url: entry.raw_image_url, ...(entry.structured_data as Record<string, unknown>) }}
                            loggedAt={entry.logged_at}
                            onDelete={() => handleDelete(entry.id)}
                            onEdit={(updated, newLoggedAt) => handleEdit(entry.id, updated, newLoggedAt)}
                            swipeable
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* ── Yesterday ── */}
              {(yesterdayMeals.length > 0 || Object.keys(yesterdayGrouped).length > 0) && (
                <>
                  <DateBanner label="Yesterday" />

                  {yesterdayMeals.map(meal => (
                    <MealSection
                      key={meal.id}
                      meal={meal}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                    />
                  ))}

                  {Object.entries(yesterdayGrouped).map(([type, typeEntries]) => (
                    <div key={type}>
                      <SectionLabel label={GROUP_LABELS[type] ?? type} />
                      <div className="px-4 space-y-2 mt-1">
                        {typeEntries.map((entry) => (
                          <LogEntryCard
                            key={entry.id}
                            entryType={entry.entry_type}
                            data={{ entry_id: entry.id, raw_image_url: entry.raw_image_url, ...(entry.structured_data as Record<string, unknown>) }}
                            loggedAt={entry.logged_at}
                            onDelete={() => handleDelete(entry.id)}
                            onEdit={(updated, newLoggedAt) => handleEdit(entry.id, updated, newLoggedAt)}
                            swipeable
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {todayMeals.length === 0 && Object.keys(todayGrouped).length === 0 &&
               yesterdayMeals.length === 0 && Object.keys(yesterdayGrouped).length === 0 && (
                <div className="flex flex-col items-center justify-center text-center px-6 py-12">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Nothing logged yet</p>
                  <p className="text-xs text-gray-400">Head to Chat to start tracking.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
