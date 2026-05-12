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

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ level }: { level: "low" | "medium" | "high" }) {
  const styles = {
    high:   "bg-green-100 text-green-700",
    medium: "bg-amber-100 text-amber-700",
    low:    "bg-gray-100 text-gray-500",
  };
  const labels = { high: "Strong signal", medium: "Likely", low: "Weak signal" };
  return (
    <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

// ── Dots loading indicator ────────────────────────────────────────────────────
function DotsLoader() {
  return (
    <div className="flex gap-1 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

export default function InsightsClient({ entries, profile, timezone }: Props) {
  const tz = timezone || "UTC";
  const calorieGoal  = profile?.calorie_goal    ?? 2000;
  const proteinGoal  = profile?.protein_goal_g  ?? 150;
  const carbsGoal    = profile?.carbs_goal_g    ?? 250;
  const fatGoal      = profile?.fat_goal_g      ?? 65;

  const [days, setDays] = useState<DayRange>(30);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Main AI analysis chat ──────────────────────────────────────────────────
  const { messages, setMessages, input, handleInputChange, handleSubmit, append, isLoading } = useChat({
    api: "/api/insights-chat",
    body: { timezone: tz, days },
  });

  // ── Quick Trends state ─────────────────────────────────────────────────────
  const [trendStatus, setTrendStatus] = useState<"idle" | "loading" | "error">("idle");
  const [quickTrend, setQuickTrend] = useState<{ text: string; confidence: "low" | "medium" | "high" } | null>(null);
  const [seenTrends, setSeenTrends] = useState<string[]>([]);
  const [trendExpanded, setTrendExpanded] = useState(false);
  const qaInputRef = useRef<HTMLTextAreaElement>(null);

  // Separate useChat for the trend deep-dive + follow-up conversation
  const {
    messages: trendMessages,
    setMessages: setTrendMessages,
    input: trendInput,
    handleInputChange: handleTrendInputChange,
    handleSubmit: handleTrendSubmit,
    append: appendTrend,
    isLoading: trendChatLoading,
  } = useChat({
    api: "/api/insights-chat",
    body: { timezone: tz, days },
  });

  // Separate useChat for the "Ask your data" Q&A section
  const {
    messages: qaMessages,
    input: qaInput,
    handleInputChange: handleQaInputChange,
    handleSubmit: handleQaSubmit,
    isLoading: qaLoading,
  } = useChat({
    api: "/api/insights-chat",
    body: { timezone: tz, days },
  });

  // Auto-resize the Q&A textarea whenever its value changes (e.g. chip pre-fill)
  useEffect(() => {
    const ta = qaInputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [qaInput]);

  const fetchTrend = useCallback(async (exclude: string[]) => {
    setTrendStatus("loading");
    setTrendExpanded(false);
    setTrendMessages([]);
    try {
      const res = await fetch("/api/quick-trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz, days, excludeTrends: exclude }),
      });
      const data = await res.json() as { found: boolean; trend?: string; confidence?: "low" | "medium" | "high"; reason?: string };
      if (data.found && data.trend && data.confidence) {
        setQuickTrend({ text: data.trend, confidence: data.confidence });
        setSeenTrends(prev => [...prev, data.trend!]);
        setTrendStatus("idle");
      } else {
        setTrendStatus("error");
      }
    } catch {
      setTrendStatus("error");
    }
  }, [tz, days, setTrendMessages]);

  const handleTrendInteresting = useCallback(() => {
    if (!quickTrend) return;
    setTrendExpanded(true);
    setTrendMessages([]);
    void appendTrend(
      {
        role: "user",
        content: `I want to explore this pattern more deeply: "${quickTrend.text}". What data in my log supports this? What might it mean for my health, and is there anything actionable I can do?`,
      },
      { body: { timezone: tz, days } }
    );
  }, [quickTrend, setTrendMessages, appendTrend, tz, days]);

  const handleTrendDontThinkSo = useCallback(() => {
    void fetchTrend(seenTrends);
  }, [fetchTrend, seenTrends]);

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

  // Suggested questions for the Q&A section
  const SUGGESTED_QUESTIONS = [
    { label: "💪 Protein goal",    message: "How am I tracking on protein vs my daily goal this week? Am I consistently hitting it?" },
    { label: "🔥 Calorie trend",   message: "What's the trend in my calorie intake over the past week? Am I above or below my goal most days?" },
    { label: "📈 Progress check",  message: "Based on my recent logs, am I making progress toward my health goal? What's working and what isn't?" },
    { label: "😴 Sleep impact",    message: "How has my sleep been this week, and do you see any connection between sleep and how I eat or feel?" },
    { label: "🏋️ Exercise recap",  message: "Summarize my exercise activity and calories burned this week. How does it compare to a good week?" },
    { label: "⚖️ Macro balance",   message: "How balanced are my macros — protein, carbs, and fat — compared to my goals? Any consistent gaps?" },
    { label: "📅 Best day",        message: "Which day this week had the best overall nutrition? What made it better than the others?" },
    { label: "🍽️ Biggest meals",   message: "When am I eating the most calories during the day? Breakfast, lunch, dinner, or snacks?" },
  ] as const;

  const qaVisibleMessages = qaMessages.filter((m, i) => !(i === 0 && m.role === "user"));

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

        {/* ── Quick Trends ── */}
        {hasAnyData && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">✨ Quick Trend</p>
              <p className="text-xs text-gray-400">A pattern AI noticed in your data</p>
            </div>

            <div className="px-4 py-4">
              {/* Idle — no trend fetched yet */}
              {!quickTrend && trendStatus === "idle" && (
                <div className="flex flex-col items-center py-3 gap-3">
                  <p className="text-xs text-gray-400 text-center leading-relaxed">
                    Tap to see a specific pattern AI spotted across your logs.
                  </p>
                  <button
                    onClick={() => fetchTrend(seenTrends)}
                    className="bg-brand-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-brand-600 active:scale-95 transition-all"
                  >
                    Discover a trend
                  </button>
                </div>
              )}

              {/* Loading */}
              {trendStatus === "loading" && (
                <div className="flex items-center gap-2 text-gray-400">
                  <DotsLoader />
                  <span className="text-xs">Looking for patterns…</span>
                </div>
              )}

              {/* Not enough data */}
              {trendStatus === "error" && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Not enough data yet to spot a reliable trend — keep logging!
                </p>
              )}

              {/* Trend card */}
              {quickTrend && trendStatus === "idle" && (
                <div className="space-y-3">
                  {/* Trend sentence + confidence */}
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-gray-800 flex-1 leading-snug">{quickTrend.text}</p>
                    <ConfidenceBadge level={quickTrend.confidence} />
                  </div>

                  {/* Action buttons — hidden once expanded */}
                  {!trendExpanded && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleTrendInteresting}
                        disabled={trendChatLoading}
                        className="flex-1 py-2 bg-brand-50 text-brand-600 rounded-xl text-xs font-semibold border border-brand-100 hover:bg-brand-100 active:scale-95 transition-all disabled:opacity-50"
                      >
                        Interesting →
                      </button>
                      <button
                        onClick={handleTrendDontThinkSo}
                        className="flex-1 py-2 bg-gray-50 text-gray-500 rounded-xl text-xs font-semibold border border-gray-100 hover:bg-gray-100 active:scale-95 transition-all"
                      >
                        I don&apos;t think so
                      </button>
                    </div>
                  )}

                  {/* Expanded deep-dive */}
                  {trendExpanded && (
                    <div className="space-y-3 pt-1 border-t border-gray-50">
                      {/* Streaming analysis */}
                      {trendChatLoading && trendMessages.filter(m => m.role === "assistant").length === 0 && (
                        <DotsLoader />
                      )}
                      {trendMessages
                        .filter((m, i) => !(i === 0 && m.role === "user")) // hide trigger msg
                        .map((m) => (
                          <div key={m.id}>
                            {m.role === "assistant" ? (
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                            ) : (
                              <div className="flex justify-end">
                                <div className="bg-brand-500 text-white text-sm rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">
                                  {m.content}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      {trendChatLoading && trendMessages.filter(m => m.role === "assistant").length > 0 && (
                        <DotsLoader />
                      )}

                      {/* Follow-up input */}
                      <form onSubmit={handleTrendSubmit} className="flex gap-2">
                        <input
                          value={trendInput}
                          onChange={handleTrendInputChange}
                          placeholder="Ask a follow-up…"
                          disabled={trendChatLoading}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-brand-400 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={trendChatLoading || !trendInput.trim()}
                          className="bg-brand-500 text-white rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40"
                        >
                          Send
                        </button>
                      </form>

                      {/* Try a different trend */}
                      <button
                        onClick={handleTrendDontThinkSo}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        ← Try a different trend
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ask your data ── */}
        {hasAnyData && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">💬 Ask your data</p>
              <p className="text-xs text-gray-400">Ask anything about your logs</p>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Conversation */}
              {qaVisibleMessages.map((m) => (
                <div key={m.id}>
                  {m.role === "assistant" ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <div className="flex justify-end">
                      <div className="bg-brand-500 text-white text-sm rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">
                        {m.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {qaLoading && <DotsLoader />}

              {/* Input */}
              <form onSubmit={handleQaSubmit} className="flex gap-2 items-end">
                <textarea
                  ref={qaInputRef}
                  value={qaInput}
                  rows={1}
                  onChange={e => {
                    handleQaInputChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
                    const ta = e.currentTarget;
                    ta.style.height = "auto";
                    ta.style.height = `${ta.scrollHeight}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!qaLoading && qaInput.trim()) {
                        e.currentTarget.closest("form")?.requestSubmit();
                      }
                    }
                  }}
                  placeholder="e.g. How's my protein this week?"
                  disabled={qaLoading}
                  className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-brand-400 disabled:opacity-50 overflow-hidden"
                />
                <button
                  type="submit"
                  disabled={qaLoading || !qaInput.trim()}
                  className="flex-shrink-0 bg-brand-500 text-white rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40"
                >
                  Ask
                </button>
              </form>

              {/* Suggested question chips — hidden once conversation starts */}
              {qaVisibleMessages.length === 0 && !qaLoading && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => {
                        handleQaInputChange({ target: { value: q.message } } as unknown as React.ChangeEvent<HTMLInputElement>);
                        qaInputRef.current?.focus();
                      }}
                      className="flex-shrink-0 bg-gray-100 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 text-gray-600 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              )}
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
