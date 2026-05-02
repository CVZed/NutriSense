"use client";

import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "ai/react";
import type { Database } from "@/types/database";

type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface Props {
  entries: LogEntry[];
  profile: Profile | null;
  timezone: string;
}

interface DaySummary {
  label: string;
  isToday: boolean;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  caloriesBurned: number;
  exerciseSessions: number;
  sleepMinutes: number;
  hasData: boolean;
}

function toLocalDateStr(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString("en-CA", { timeZone: tz });
}

function fmtSleep(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Day range selector ────────────────────────────────────────────────────────
const DAY_OPTIONS = [7, 30, 60, 90] as const;
type DayRange = typeof DAY_OPTIONS[number];

export default function InsightsClient({ entries, profile, timezone }: Props) {
  const tz = timezone || "UTC";
  const calorieGoal  = profile?.calorie_goal    ?? 2000;
  const proteinGoal  = profile?.protein_goal_g  ?? 150;
  const carbsGoal    = profile?.carbs_goal_g    ?? 250;
  const fatGoal      = profile?.fat_goal_g      ?? 65;

  const [days, setDays] = useState<DayRange>(30);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── AI chat ────────────────────────────────────────────────────────────────
  const { messages, setMessages, input, handleInputChange, handleSubmit, append, isLoading } = useChat({
    api: "/api/insights-chat",
    body: { timezone: tz, days },
  });

  // Trigger (or re-trigger) AI analysis for a given day range
  const triggerAnalysis = useCallback((d: DayRange) => {
    setMessages([]);
    void append(
      {
        role: "user",
        content: `Please analyze my health data for the past ${d} days and identify any meaningful patterns or correlations — especially connections between specific foods, sleep, exercise, symptoms, and mood.`,
      },
      { body: { timezone: tz, days: d } }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [append, setMessages, tz]);

  // Analysis is triggered manually — no auto-fire on page load

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Chart data (always 7-day view for the charts) ─────────────────────────
  const daySummaries = useMemo<DaySummary[]>(() => {
    const map = new Map<string, DaySummary>();
    const order: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: tz });
      const label = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }).slice(0, 3);
      order.push(dateStr);
      map.set(dateStr, {
        label, isToday: i === 0,
        calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
        caloriesBurned: 0, exerciseSessions: 0, sleepMinutes: 0,
        hasData: false,
      });
    }

    for (const entry of entries) {
      const dateStr = toLocalDateStr(entry.logged_at, tz);
      const day = map.get(dateStr);
      if (!day) continue;
      const sd = (entry.structured_data ?? {}) as Record<string, unknown>;

      if (entry.entry_type === "food" || entry.entry_type === "drink") {
        day.calories += Number(sd.calories ?? 0);
        day.protein_g += Number(sd.protein_g ?? 0);
        day.carbs_g   += Number(sd.carbs_g   ?? 0);
        day.fat_g     += Number(sd.fat_g     ?? 0);
        day.hasData = true;
      } else if (entry.entry_type === "exercise") {
        day.caloriesBurned  += Number(sd.calories_burned_est ?? 0);
        day.exerciseSessions += 1;
        day.hasData = true;
      } else if (entry.entry_type === "sleep") {
        day.sleepMinutes += Number(sd.duration_min ?? 0);
        day.hasData = true;
      }
    }

    return order.map(d => map.get(d)!);
  }, [entries, tz]);

  const stats = useMemo(() => {
    const foodDays = daySummaries.filter(d => d.calories > 0);
    const avgCalories = foodDays.length
      ? Math.round(foodDays.reduce((s, d) => s + d.calories, 0) / foodDays.length) : 0;
    const daysLogged = foodDays.length;
    const totalExercise = daySummaries.reduce((s, d) => s + d.exerciseSessions, 0);
    const totalCalBurned = daySummaries.reduce((s, d) => s + d.caloriesBurned, 0);
    const sleepDays = daySummaries.filter(d => d.sleepMinutes > 0);
    const avgSleepMin = sleepDays.length
      ? Math.round(sleepDays.reduce((s, d) => s + d.sleepMinutes, 0) / sleepDays.length) : 0;
    const avgProtein = foodDays.length
      ? Math.round(foodDays.reduce((s, d) => s + d.protein_g, 0) / foodDays.length) : 0;
    const avgCarbs = foodDays.length
      ? Math.round(foodDays.reduce((s, d) => s + d.carbs_g,   0) / foodDays.length) : 0;
    const avgFat = foodDays.length
      ? Math.round(foodDays.reduce((s, d) => s + d.fat_g,     0) / foodDays.length) : 0;
    const daysOnTarget = foodDays.filter(d => calorieGoal > 0 && d.calories <= calorieGoal).length;
    return { avgCalories, daysLogged, totalExercise, totalCalBurned, avgSleepMin, avgProtein, avgCarbs, avgFat, daysOnTarget };
  }, [daySummaries, calorieGoal]);

  const hasAnyData = daySummaries.some(d => d.hasData);
  const maxBarCal = Math.max(calorieGoal * 1.3, ...daySummaries.map(d => d.calories), 200);
  const goalLinePct = calorieGoal > 0 ? Math.min(96, (calorieGoal / maxBarCal) * 100) : null;

  // Filter AI messages to show (skip the auto-trigger user message)
  const visibleMessages = messages.filter((m, i) => !(i === 0 && m.role === "user"));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 pt-safe flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900">Insights</p>
        <p className="text-xs text-gray-400">Past 7 days · AI analysis below</p>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-4 space-y-3 pb-24">

        {/* ── Stat cards ── */}
        {hasAnyData && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Avg cal/day</p>
              <p className="text-base font-bold text-gray-900 leading-tight">
                {stats.avgCalories > 0 ? stats.avgCalories.toLocaleString() : "—"}
              </p>
              <p className="text-xs text-gray-400">goal {calorieGoal.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Days logged</p>
              <p className="text-base font-bold text-gray-900 leading-tight">
                {stats.daysLogged}<span className="text-xs font-normal text-gray-400">/7</span>
              </p>
              <p className="text-xs text-gray-400">this week</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Workouts</p>
              <p className="text-base font-bold text-gray-900 leading-tight">{stats.totalExercise}</p>
              <p className="text-xs text-gray-400">
                {stats.totalCalBurned > 0 ? `${Math.round(stats.totalCalBurned)} cal` : "this week"}
              </p>
            </div>
          </div>
        )}

        {/* ── Calorie bar chart ── */}
        {hasAnyData && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-1">Daily Calories</p>
            {calorieGoal > 0 && stats.daysLogged > 0 && (
              <p className="text-xs text-gray-400 mb-3">
                On target {stats.daysOnTarget} of {stats.daysLogged} logged {stats.daysLogged === 1 ? "day" : "days"}
              </p>
            )}
            <div className="relative h-28 mb-2">
              {goalLinePct !== null && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-gray-300 pointer-events-none"
                  style={{ bottom: `${goalLinePct}%` }}
                >
                  <span className="absolute -top-3.5 right-0 text-[10px] text-gray-300 leading-none">
                    {calorieGoal.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 flex items-end gap-1">
                {daySummaries.map((day, i) => {
                  const pct = day.calories > 0 ? Math.min(100, (day.calories / maxBarCal) * 100) : 0;
                  const over = calorieGoal > 0 && day.calories > calorieGoal;
                  return (
                    <div key={i} className="flex-1 h-full flex flex-col justify-end">
                      <div
                        className={`w-full rounded-t-md ${
                          pct === 0 ? "bg-gray-100" : over ? "bg-amber-400" : "bg-brand-500"
                        } ${day.isToday ? "" : "opacity-60"}`}
                        style={{ height: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-1">
              {daySummaries.map((day, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className={`text-[11px] ${day.isToday ? "font-semibold text-gray-700" : "text-gray-400"}`}>
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Macros ── */}
        {(stats.avgProtein > 0 || stats.avgCarbs > 0 || stats.avgFat > 0) && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-3">Avg Daily Macros</p>
            <div className="space-y-3">
              {[
                { label: "Protein", value: stats.avgProtein, goal: proteinGoal, color: "bg-blue-500" },
                { label: "Carbs",   value: stats.avgCarbs,   goal: carbsGoal,   color: "bg-amber-400" },
                { label: "Fat",     value: stats.avgFat,     goal: fatGoal,     color: "bg-rose-400" },
              ].map(({ label, value, goal, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{label}</span>
                    <span className="text-gray-500">
                      {value}g{goal > 0 && <span className="text-gray-300"> / {goal}g</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full`}
                      style={{ width: `${Math.min(100, goal > 0 ? (value / goal) * 100 : 50)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sleep ── */}
        {stats.avgSleepMin > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-2">Sleep</p>
            <div className="flex items-center gap-3">
              <span className="text-2xl">😴</span>
              <div>
                <p className="text-lg font-bold text-gray-900">{fmtSleep(stats.avgSleepMin)}</p>
                <p className="text-xs text-gray-400">avg per night this week</p>
              </div>
            </div>
          </div>
        )}

        {/* ── AI Analysis ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* AI section header with day-range selector */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">AI Analysis</p>
              <p className="text-xs text-gray-400">Patterns across your full history</p>
            </div>
            <div className="flex gap-1">
              {DAY_OPTIONS.map(d => (
                <button
                  key={d}
                  disabled={isLoading}
                  onClick={() => {
                    setDays(d);
                    // Only re-run analysis if one has already been triggered
                    if (visibleMessages.length > 0) triggerAnalysis(d);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    days === d
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="px-4 py-3 space-y-3 min-h-[120px]">
            {/* Not yet triggered — show prompt button */}
            {visibleMessages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <p className="text-xs text-gray-400 text-center leading-relaxed">
                  AI analysis looks for patterns across your full history — food, sleep, exercise, mood, and symptoms.
                </p>
                <button
                  onClick={() => triggerAnalysis(days)}
                  className="bg-brand-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-brand-600 active:scale-95 transition-all"
                >
                  Analyze my last {days} days
                </button>
              </div>
            )}

            {/* Loading spinner */}
            {visibleMessages.length === 0 && isLoading && (
              <div className="flex items-center gap-2 text-gray-400 py-4">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
                </div>
                <span className="text-xs">Analyzing your data…</span>
              </div>
            )}

            {visibleMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "assistant" ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                ) : (
                  <div className="flex justify-end">
                    <div className="bg-brand-500 text-white text-sm rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && visibleMessages.length > 0 && (
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Follow-up input */}
          {visibleMessages.length > 0 && (
            <form onSubmit={handleSubmit} className="px-4 pb-4 flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask a follow-up question…"
                disabled={isLoading}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-brand-400 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-brand-500 text-white rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}
        </div>

        <div ref={bottomRef} />
      </div>
      </div>
    </div>
  );
}
