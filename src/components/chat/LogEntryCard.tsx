"use client";

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogEntryCardProps {
  entryType: string;
  data: Record<string, unknown>;
  loggedAt?: string; // UTC ISO — the timestamp on the log_entries row
  onDelete?: () => void;
  onEdit?: (updatedStructuredData: Record<string, unknown>, newLoggedAt?: string) => void;
  /** Enable swipe-left-to-delete gesture (Timeline view only) */
  swipeable?: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; emoji: string; accent: string }> = {
  food:     { label: "Food logged",     color: "bg-green-50 border-green-100",   emoji: "🥗", accent: "border-green-300 focus:ring-green-200" },
  drink:    { label: "Drink logged",    color: "bg-green-50 border-green-100",   emoji: "☕", accent: "border-green-300 focus:ring-green-200" },
  exercise: { label: "Exercise logged", color: "bg-blue-50 border-blue-100",     emoji: "💪", accent: "border-blue-300 focus:ring-blue-200" },
  sleep:    { label: "Sleep logged",    color: "bg-purple-50 border-purple-100", emoji: "😴", accent: "border-purple-300 focus:ring-purple-200" },
  symptom:  { label: "Symptom logged",  color: "bg-orange-50 border-orange-100", emoji: "🩺", accent: "border-orange-300 focus:ring-orange-200" },
  mood:     { label: "Mood logged",     color: "bg-yellow-50 border-yellow-100", emoji: "😊", accent: "border-yellow-300 focus:ring-yellow-200" },
  note:     { label: "Note logged",     color: "bg-gray-50 border-gray-100",     emoji: "📝", accent: "border-gray-300 focus:ring-gray-200" },
};

// ── Time helpers ──────────────────────────────────────────────────────────────
/** Convert a UTC ISO string → "YYYY-MM-DDTHH:MM" in local time (for datetime-local inputs) */
function toLocalInput(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local value ("YYYY-MM-DDTHH:MM") → UTC ISO string */
function fromLocalInput(localStr: string): string {
  return new Date(localStr).toISOString();
}

/** Format minutes as "Xh MMm" */
function fmtDuration(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Format a UTC ISO string as a short local time ("9:30 AM") */
function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ── Field state helpers ───────────────────────────────────────────────────────
function initFields(
  entryType: string,
  data: Record<string, unknown>,
  loggedAt?: string,
): Record<string, string> {
  const str = (k: string) => data[k] != null ? String(data[k]) : "";
  switch (entryType) {
    case "food":
    case "drink":
      return {
        name: str("name"), quantity: str("quantity"), unit: str("unit"),
        calories: str("calories"), protein_g: str("protein_g"),
        carbs_g: str("carbs_g"), fat_g: str("fat_g"),
        logged_at_local: loggedAt ? toLocalInput(loggedAt) : "",
      };
    case "exercise":
      return {
        activity_type: str("activity_type"), duration_min: str("duration_min"),
        intensity: str("intensity") || "moderate",
        calories_burned_est: str("calories_burned_est"),
        workout_feel: str("workout_feel"),
        logged_at_local: loggedAt ? toLocalInput(loggedAt) : "",
      };
    case "sleep": {
      // Prefer explicit start/end stored in structured_data; fall back to loggedAt ± duration
      let startLocal = "";
      let endLocal = "";
      if (data.start_time) {
        startLocal = toLocalInput(String(data.start_time));
      } else if (loggedAt && data.duration_min) {
        const endMs = new Date(loggedAt).getTime();
        const startMs = endMs - Number(data.duration_min) * 60_000;
        startLocal = toLocalInput(new Date(startMs).toISOString());
      }
      if (data.end_time) {
        endLocal = toLocalInput(String(data.end_time));
      } else if (loggedAt) {
        endLocal = toLocalInput(loggedAt);
      }
      return { start_time: startLocal, end_time: endLocal, quality_signal: str("quality_signal") || "good" };
    }
    case "symptom":
      return { symptom_name: str("symptom_name"), severity: str("severity"), body_area: str("body_area") };
    case "mood":
      return {
        mood_label: str("mood_label") || "okay",
        energy_level: str("energy_level"), hunger_level: str("hunger_level"),
      };
    default:
      return {};
  }
}

function buildStructuredData(entryType: string, fields: Record<string, string>): Record<string, unknown> {
  const n = (k: string) => fields[k] !== "" ? Number(fields[k]) : undefined;
  const s = (k: string) => fields[k] || undefined;

  switch (entryType) {
    case "food":
    case "drink":
      return {
        name: s("name"), quantity: n("quantity"), unit: s("unit"),
        calories: n("calories") ?? 0, protein_g: n("protein_g") ?? 0,
        carbs_g: n("carbs_g") ?? 0, fat_g: n("fat_g") ?? 0,
      };
    case "exercise":
      return {
        activity_type: s("activity_type"), duration_min: n("duration_min"),
        intensity: s("intensity"), calories_burned_est: n("calories_burned_est") ?? 0,
        workout_feel: s("workout_feel"),
      };
    case "sleep": {
      const startIso = fields.start_time ? fromLocalInput(fields.start_time) : undefined;
      const endIso = fields.end_time ? fromLocalInput(fields.end_time) : undefined;
      const durationMin =
        startIso && endIso
          ? Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
          : undefined;
      return { start_time: startIso, end_time: endIso, duration_min: durationMin, quality_signal: s("quality_signal") };
    }
    case "symptom":
      return { symptom_name: s("symptom_name"), severity: n("severity"), body_area: s("body_area") };
    case "mood":
      return { mood_label: s("mood_label"), energy_level: n("energy_level"), hunger_level: n("hunger_level") };
    default:
      return {};
  }
}

/** Returns the new logged_at UTC ISO string for types where the user can edit the event timestamp */
function getNewLoggedAt(entryType: string, fields: Record<string, string>): string | undefined {
  if ((entryType === "food" || entryType === "drink" || entryType === "exercise") && fields.logged_at_local) {
    return fromLocalInput(fields.logged_at_local);
  }
  return undefined;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-semibold text-gray-700">{value}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", min, step, options, accent,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "select" | "datetime-local";
  min?: number;
  step?: number;
  options?: { value: string; label: string }[];
  accent: string;
}) {
  const base = cn(
    "w-full text-xs rounded-lg border px-2 py-1.5 bg-white focus:outline-none focus:ring-1",
    accent
  );
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</label>
      {type === "select" && options ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={base}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LogEntryCard({ entryType, data, loggedAt, onDelete, onEdit, swipeable = false }: LogEntryCardProps) {
  const config = TYPE_CONFIG[entryType] ?? TYPE_CONFIG.note;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [fields, setFields] = useState<Record<string, string>>(() => initFields(entryType, data, loggedAt));
  const [liveData, setLiveData] = useState(data);
  const [liveLoggedAt, setLiveLoggedAt] = useState(loggedAt);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // ── Swipe-to-delete ────────────────────────────────────────────────────────
  const SWIPE_MAX = 80;
  const SWIPE_THRESHOLD = 60;
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false); // true while finger is down

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeable || mode !== "view") return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwiping(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeable || mode !== "view") return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // If primarily vertical, don't hijack scroll
    if (!swiping && Math.abs(dy) > Math.abs(dx) + 5) return;
    if (dx > 0) return; // only allow left swipes
    setSwiping(true);
    e.preventDefault();
    setSwipeX(Math.max(-SWIPE_MAX, dx));
  }

  function onTouchEnd() {
    if (!swipeable || mode !== "view") return;
    setSwiping(false);
    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-SWIPE_MAX);
      void handleDelete();
    } else {
      setSwipeX(0);
    }
  }

  const set = (k: string) => (v: string) => setFields((f) => ({ ...f, [k]: v }));

  // Live-computed sleep duration as user adjusts pickers
  const sleepDurationPreview = useMemo(() => {
    if (entryType !== "sleep" || !fields.start_time || !fields.end_time) return "";
    const diff =
      new Date(fromLocalInput(fields.end_time)).getTime() -
      new Date(fromLocalInput(fields.start_time)).getTime();
    return diff > 0 ? fmtDuration(diff / 60_000) : "";
  }, [entryType, fields.start_time, fields.end_time]);

  const handleSave = async () => {
    if (!liveData.entry_id || saving) return;
    setSaving(true);
    try {
      const structured_data = buildStructuredData(entryType, fields);
      const newLoggedAt = getNewLoggedAt(entryType, fields);
      const body: Record<string, unknown> = { structured_data };
      if (newLoggedAt) body.logged_at = newLoggedAt;
      const res = await fetch(`/api/log-entries/${liveData.entry_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setLiveData((prev) => ({ ...prev, ...structured_data }));
        if (newLoggedAt) setLiveLoggedAt(newLoggedAt);
        onEdit?.(structured_data, newLoggedAt);
        setMode("view");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!liveData.entry_id || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/log-entries/${liveData.entry_id}`, { method: "DELETE" });
      if (res.ok) { setDeleted(true); onDelete?.(); }
    } finally {
      setDeleting(false);
    }
  };

  if (deleted) return null;

  const cardContent = (
    <div
      className={cn("rounded-xl border px-3 py-2.5 text-sm", config.color)}
      style={swipeable ? {
        transform: `translateX(${swipeX}px)`,
        transition: swiping ? "none" : "transform 0.25s ease",
      } : undefined}
      onTouchStart={swipeable ? onTouchStart : undefined}
      onTouchMove={swipeable ? onTouchMove : undefined}
      onTouchEnd={swipeable ? onTouchEnd : undefined}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span>{config.emoji}</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {config.label}
          </span>
        </div>
        {!!liveData.entry_id && (
          <div className="flex items-center gap-1.5">
            {mode === "view" ? (
              <>
                <button
                  onClick={() => { setFields(initFields(entryType, liveData, liveLoggedAt)); setMode("edit"); }}
                  className="text-gray-300 hover:text-blue-400 transition-colors p-0.5 rounded"
                  title="Edit entry"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-gray-300 hover:text-red-400 transition-colors p-0.5 rounded"
                  title="Delete entry"
                >
                  {deleting ? (
                    <span className="text-[10px] text-gray-400">...</span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => setMode("view")}
                className="text-gray-400 hover:text-gray-600 transition-colors text-xs px-1.5"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── VIEW MODE ── */}
      {mode === "view" && (
        <>
          {/* Photo thumbnail — shown for any entry logged from a photo */}
          {liveData.raw_image_url && (
            <div className="mb-2">
              <div className="relative w-full h-32 rounded-lg overflow-hidden">
                <Image
                  src={String(liveData.raw_image_url)}
                  alt="Logged from photo"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          )}

          {(entryType === "food" || entryType === "drink") && (
            <div className="space-y-1.5">
              <p className="font-medium text-gray-900 text-sm">
                {String(liveData.name ?? "Unknown item")}
                {liveData.quantity && liveData.unit ? ` · ${liveData.quantity} ${liveData.unit}` : ""}
              </p>
              {(liveData.calories || liveData.protein_g || liveData.carbs_g || liveData.fat_g) ? (
                <div className="flex gap-4">
                  {liveData.calories != null && <StatPill label="cal" value={Math.round(Number(liveData.calories))} />}
                  {liveData.protein_g != null && <StatPill label="protein" value={`${Math.round(Number(liveData.protein_g))}g`} />}
                  {liveData.carbs_g != null && <StatPill label="carbs" value={`${Math.round(Number(liveData.carbs_g))}g`} />}
                  {liveData.fat_g != null && <StatPill label="fat" value={`${Math.round(Number(liveData.fat_g))}g`} />}
                </div>
              ) : null}
              {liveLoggedAt && (
                <p className="text-[10px] text-gray-400">{fmtTime(liveLoggedAt)}</p>
              )}
            </div>
          )}

          {entryType === "exercise" && (
            <div className="space-y-1.5">
              <p className="font-medium text-gray-900 text-sm">
                {String(liveData.activity_type ?? "Exercise")}
                {liveData.intensity ? ` · ${liveData.intensity} intensity` : ""}
                {liveData.workout_feel ? ` · felt ${liveData.workout_feel}` : ""}
              </p>
              <div className="flex gap-4">
                {liveData.duration_min != null && <StatPill label="min" value={Number(liveData.duration_min)} />}
                {liveData.calories_burned_est != null && <StatPill label="cal burned" value={Math.round(Number(liveData.calories_burned_est))} />}
              </div>
              {liveLoggedAt && (
                <p className="text-[10px] text-gray-400">Started {fmtTime(liveLoggedAt)}</p>
              )}
            </div>
          )}

          {entryType === "sleep" && (
            <div className="space-y-1">
              {liveData.start_time && liveData.end_time ? (
                <>
                  <p className="font-medium text-gray-900 text-sm">
                    {fmtTime(String(liveData.start_time))} – {fmtTime(String(liveData.end_time))}
                  </p>
                  {liveData.duration_min != null && (
                    <p className="text-xs text-gray-500">
                      {fmtDuration(Number(liveData.duration_min))}
                      {liveData.quality_signal ? ` · ${liveData.quality_signal}` : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-medium text-gray-900 text-sm">
                  {liveData.duration_min
                    ? fmtDuration(Number(liveData.duration_min))
                    : "Sleep recorded"}
                  {liveData.quality_signal ? ` · ${liveData.quality_signal}` : ""}
                </p>
              )}
            </div>
          )}

          {entryType === "symptom" && (
            <div className="space-y-1.5">
              <p className="font-medium text-gray-900 text-sm">
                {String(liveData.symptom_name ?? "Symptom")}
                {liveData.body_area ? ` · ${liveData.body_area}` : ""}
              </p>
              {liveData.severity != null && (
                <div className="flex gap-1 items-center">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={cn("w-3 h-3 rounded-full", i < Number(liveData.severity) ? "bg-orange-400" : "bg-gray-200")} />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">severity</span>
                </div>
              )}
            </div>
          )}

          {entryType === "mood" && (
            <div className="space-y-1.5">
              <p className="font-medium text-gray-900 text-sm capitalize">
                {String(liveData.mood_label ?? "Mood recorded")}
              </p>
              <div className="flex gap-4">
                {liveData.energy_level != null && <StatPill label="energy" value={`${liveData.energy_level}/5`} />}
                {liveData.hunger_level != null && <StatPill label="hunger" value={`${liveData.hunger_level}/5`} />}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── EDIT MODE ── */}
      {mode === "edit" && (
        <div className="space-y-2 pt-0.5">

          {(entryType === "food" || entryType === "drink") && (
            <>
              {fields.logged_at_local && (
                <Field label="Time" value={fields.logged_at_local} onChange={set("logged_at_local")} type="datetime-local" accent={config.accent} />
              )}
              <Field label="Name" value={fields.name} onChange={set("name")} accent={config.accent} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity" value={fields.quantity} onChange={set("quantity")} type="number" min={0} step={0.1} accent={config.accent} />
                <Field label="Unit" value={fields.unit} onChange={set("unit")} accent={config.accent} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Calories" value={fields.calories} onChange={set("calories")} type="number" min={0} accent={config.accent} />
                <Field label="Protein (g)" value={fields.protein_g} onChange={set("protein_g")} type="number" min={0} step={0.1} accent={config.accent} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Carbs (g)" value={fields.carbs_g} onChange={set("carbs_g")} type="number" min={0} step={0.1} accent={config.accent} />
                <Field label="Fat (g)" value={fields.fat_g} onChange={set("fat_g")} type="number" min={0} step={0.1} accent={config.accent} />
              </div>
            </>
          )}

          {entryType === "exercise" && (
            <>
              {fields.logged_at_local && (
                <Field label="Start time" value={fields.logged_at_local} onChange={set("logged_at_local")} type="datetime-local" accent={config.accent} />
              )}
              <Field label="Activity" value={fields.activity_type} onChange={set("activity_type")} accent={config.accent} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Duration (min)" value={fields.duration_min} onChange={set("duration_min")} type="number" min={0} accent={config.accent} />
                <Field label="Intensity" value={fields.intensity} onChange={set("intensity")} type="select" accent={config.accent}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "moderate", label: "Moderate" },
                    { value: "high", label: "High" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Calories burned" value={fields.calories_burned_est} onChange={set("calories_burned_est")} type="number" min={0} accent={config.accent} />
                <Field label="How it felt" value={fields.workout_feel} onChange={set("workout_feel")} type="select" accent={config.accent}
                  options={[
                    { value: "", label: "—" },
                    { value: "great", label: "Great 🔥" },
                    { value: "good", label: "Good 💪" },
                    { value: "okay", label: "Okay 😐" },
                    { value: "tough", label: "Tough 😤" },
                    { value: "exhausted", label: "Exhausted 😮‍💨" },
                  ]}
                />
              </div>
            </>
          )}

          {entryType === "sleep" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bedtime" value={fields.start_time} onChange={set("start_time")} type="datetime-local" accent={config.accent} />
                <Field label="Wake up" value={fields.end_time} onChange={set("end_time")} type="datetime-local" accent={config.accent} />
              </div>
              {sleepDurationPreview && (
                <p className="text-[11px] text-gray-400 text-center">Duration: {sleepDurationPreview}</p>
              )}
              <Field label="Quality" value={fields.quality_signal} onChange={set("quality_signal")} type="select" accent={config.accent}
                options={[
                  { value: "poor", label: "Poor" },
                  { value: "fair", label: "Fair" },
                  { value: "good", label: "Good" },
                  { value: "great", label: "Great" },
                ]}
              />
            </>
          )}

          {entryType === "symptom" && (
            <>
              <Field label="Symptom" value={fields.symptom_name} onChange={set("symptom_name")} accent={config.accent} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Severity (1–5)" value={fields.severity} onChange={set("severity")} type="number" min={1} step={1} accent={config.accent} />
                <Field label="Body area" value={fields.body_area} onChange={set("body_area")} accent={config.accent} />
              </div>
            </>
          )}

          {entryType === "mood" && (
            <>
              <Field label="Mood" value={fields.mood_label} onChange={set("mood_label")} type="select" accent={config.accent}
                options={[
                  { value: "great", label: "Great 😄" },
                  { value: "good", label: "Good 🙂" },
                  { value: "okay", label: "Okay 😐" },
                  { value: "low", label: "Low 😔" },
                  { value: "bad", label: "Bad 😞" },
                ]}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Energy (1–5)" value={fields.energy_level} onChange={set("energy_level")} type="number" min={1} step={1} accent={config.accent} />
                <Field label="Hunger (1–5)" value={fields.hunger_level} onChange={set("hunger_level")} type="number" min={1} step={1} accent={config.accent} />
              </div>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-1 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );

  if (!swipeable) return cardContent;

  // Swipeable wrapper: red delete zone revealed as card slides left
  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete zone — always behind, revealed by swipe */}
      <div className="absolute inset-0 bg-red-500 flex items-center justify-end px-5 rounded-xl pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      {cardContent}
    </div>
  );
}
