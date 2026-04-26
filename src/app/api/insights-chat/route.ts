import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const maxDuration = 60;

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];

// ── Format a UTC ISO timestamp as local time string ───────────────────────────
function fmtTime(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toLocalDateKey(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString("en-CA", { timeZone: tz }); // "2025-04-17"
}

// ── Format a single log entry as a timestamped event line ─────────────────────
function formatEntry(entry: LogEntry, tz: string): string {
  const time = fmtTime(entry.logged_at, tz);
  const sd = (entry.structured_data ?? {}) as Record<string, unknown>;

  switch (entry.entry_type) {
    case "food":
    case "drink": {
      const name = sd.name ?? entry.entry_type;
      const qty = sd.quantity && sd.unit ? ` (${sd.quantity} ${sd.unit})` : "";
      const cal = sd.calories ? ` — ${Math.round(Number(sd.calories))} cal` : "";
      const macros = [
        sd.protein_g ? `${Math.round(Number(sd.protein_g))}g protein` : null,
        sd.carbs_g   ? `${Math.round(Number(sd.carbs_g))}g carbs`   : null,
        sd.fat_g     ? `${Math.round(Number(sd.fat_g))}g fat`       : null,
      ].filter(Boolean).join(", ");
      return `  ${time}  ${entry.entry_type === "drink" ? "Drink" : "Food"}: ${name}${qty}${cal}${macros ? `, ${macros}` : ""}`;
    }

    case "exercise": {
      const activity = sd.activity_type ?? "exercise";
      const dur = sd.duration_min ? ` · ${sd.duration_min}min` : "";
      const intensity = sd.intensity ? ` · ${sd.intensity} intensity` : "";
      const burned = sd.calories_burned_est ? ` · ~${Math.round(Number(sd.calories_burned_est))} cal burned` : "";
      return `  ${time}  Exercise: ${activity}${dur}${intensity}${burned}`;
    }

    case "sleep": {
      const start = sd.start_time ? fmtTime(String(sd.start_time), tz) : null;
      const end   = sd.end_time   ? fmtTime(String(sd.end_time),   tz) : null;
      const range = start && end ? `${start} → ${end} · ` : "";
      const dur   = sd.duration_min
        ? `${Math.floor(Number(sd.duration_min) / 60)}h ${Math.round(Number(sd.duration_min) % 60)}m`
        : null;
      const quality = sd.quality_signal ? ` · quality: ${sd.quality_signal}` : "";
      return `  ${time}  Sleep: ${range}${dur ?? ""}${quality}`;
    }

    case "symptom": {
      const name = sd.symptom_name ?? "symptom";
      const sev  = sd.severity ? ` — severity ${sd.severity}/5` : "";
      const area = sd.body_area ? ` (${sd.body_area})` : "";
      const notes = sd.notes ? ` · ${sd.notes}` : "";
      return `  ${time}  Symptom: ${name}${area}${sev}${notes}`;
    }

    case "mood": {
      const mood   = sd.mood_label   ? `mood: ${sd.mood_label}` : "";
      const energy = sd.energy_level ? `energy ${sd.energy_level}/5` : "";
      const hunger = sd.hunger_level ? `hunger ${sd.hunger_level}/5` : "";
      const parts  = [mood, energy, hunger].filter(Boolean).join(" · ");
      const notes  = sd.notes ? ` · ${sd.notes}` : "";
      return `  ${time}  Mood: ${parts}${notes}`;
    }

    default: {
      const notes = sd.notes ? String(sd.notes) : entry.entry_type;
      return `  ${time}  Note: ${notes}`;
    }
  }
}

// ── Build the full timestamped event log string ───────────────────────────────
function buildEventLog(entries: LogEntry[], tz: string, days: number): string {
  if (entries.length === 0) return "No entries logged in this period.";

  // Group by local date
  const byDate = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = toLocalDateKey(entry.logged_at, tz);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(entry);
  }

  // Sort dates descending (most recent first — easier for pattern spotting)
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  const blocks: string[] = [];
  for (const dateKey of sortedDates) {
    const dayEntries = byDate.get(dateKey)!.sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    const label = fmtDate(dayEntries[0].logged_at, tz);
    const lines = dayEntries.map(e => formatEntry(e, tz));
    blocks.push(`${label}:\n${lines.join("\n")}`);
  }

  return `Event log — past ${days} days (most recent first):\n\n${blocks.join("\n\n")}`;
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildInsightsSystemPrompt(profile: Profile, eventLog: string, days: number): string {
  const name = profile.name ?? "the user";
  const goal = {
    weight_loss:      "losing weight",
    maintenance:      "maintaining weight",
    muscle_gain:      "building muscle",
    general_wellness: "general wellness",
    symptom_tracking: "tracking symptoms",
  }[profile.health_goal ?? "general_wellness"] ?? "improving health";

  const targets = [
    profile.calorie_goal    ? `calories: ${profile.calorie_goal}/day`    : null,
    profile.protein_goal_g  ? `protein: ${profile.protein_goal_g}g`      : null,
    profile.carbs_goal_g    ? `carbs: ${profile.carbs_goal_g}g`          : null,
    profile.fat_goal_g      ? `fat: ${profile.fat_goal_g}g`              : null,
  ].filter(Boolean).join(", ");

  return `You are NutriSense Insights, an expert health analyst. You are analyzing ${name}'s personal health data to identify meaningful patterns and correlations.

## User context
Goal: ${goal}
${targets ? `Daily targets: ${targets}` : ""}
${profile.dietary_notes ? `Dietary notes: ${profile.dietary_notes}` : ""}

## Your job
Analyze the timestamped event log below to find genuine, data-backed patterns and correlations between:
- Specific foods/drinks and symptoms (bloating, headaches, energy crashes, etc.)
- Alcohol consumption and sleep quality or next-day mood/energy
- Sleep duration/quality and next-day mood, energy, or food choices
- Exercise timing and sleep, mood, or appetite
- Eating timing (late meals, skipped meals) and subsequent symptoms or mood
- Dietary patterns (high-carb days, low-protein days, etc.) and energy/performance
- Any other meaningful correlations you observe

## Rules
- Only state patterns you can actually see in the data. Do not speculate beyond what the entries show.
- Be specific: name the foods, the times, the symptoms. Reference actual dates when useful.
- If the data is too sparse to draw conclusions, say so honestly.
- Keep your tone warm, direct, and non-judgmental — like a knowledgeable friend reviewing their data with them.
- Format your response in plain paragraphs. No bullet lists, no markdown headers, no bold text.
- When the user asks follow-up questions, refer back to specific entries in the log to support your answers.
- You have ${days} days of data. If a pattern needs more data to confirm, say so.

## Event log
${eventLog}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { messages, timezone, days: reqDays } = await req.json();
  const days = Math.min(90, Math.max(7, Number(reqDays) || 30));
  const tz = timezone ?? "UTC";

  // Fetch profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles").select("*").eq("id", user.id).single() as { data: Profile | null };

  // Fetch historical entries (use admin client to bypass any RLS quirks on reads)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data: entries } = await adminSupabase
    .from("log_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: true });

  const eventLog = buildEventLog((entries ?? []) as LogEntry[], tz, days);
  const systemPrompt = buildInsightsSystemPrompt(profile as unknown as Profile, eventLog, days);

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    messages,
    maxTokens: 1024,
  });

  return result.toDataStreamResponse();
}
