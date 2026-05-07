import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

export const maxDuration = 30;

type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];

// ── Shared formatting helpers (mirrored from insights-chat) ──────────────────

function fmtTime(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtDate(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
  });
}

function toLocalDateKey(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString("en-CA", { timeZone: tz });
}

function formatEntry(entry: LogEntry, tz: string): string {
  const time = fmtTime(entry.logged_at, tz);
  const sd = (entry.structured_data ?? {}) as Record<string, unknown>;
  switch (entry.entry_type) {
    case "food":
    case "drink": {
      const name = sd.name ?? entry.entry_type;
      const cal = sd.calories ? ` — ${Math.round(Number(sd.calories))} cal` : "";
      return `  ${time}  ${entry.entry_type === "drink" ? "Drink" : "Food"}: ${name}${cal}`;
    }
    case "exercise": {
      const dur = sd.duration_min ? ` · ${sd.duration_min}min` : "";
      return `  ${time}  Exercise: ${sd.activity_type ?? "exercise"}${dur}`;
    }
    case "sleep": {
      const dur = sd.duration_min
        ? `${Math.floor(Number(sd.duration_min) / 60)}h ${Math.round(Number(sd.duration_min) % 60)}m` : "";
      const quality = sd.quality_signal ? ` · ${sd.quality_signal}` : "";
      return `  ${time}  Sleep: ${dur}${quality}`;
    }
    case "symptom": {
      const sev = sd.severity ? ` — severity ${sd.severity}/5` : "";
      return `  ${time}  Symptom: ${sd.symptom_name ?? "symptom"}${sev}`;
    }
    case "mood": {
      const parts = [
        sd.mood_label ? `mood: ${sd.mood_label}` : null,
        sd.energy_level ? `energy ${sd.energy_level}/5` : null,
      ].filter(Boolean).join(" · ");
      return `  ${time}  Mood: ${parts}`;
    }
    default:
      return `  ${time}  Note: ${sd.notes ?? entry.entry_type}`;
  }
}

function buildEventLog(entries: LogEntry[], tz: string, days: number): string {
  if (entries.length === 0) return "No entries.";
  const byDate = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = toLocalDateKey(entry.logged_at, tz);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(entry);
  }
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  const blocks: string[] = [];
  for (const dateKey of sortedDates) {
    const dayEntries = byDate.get(dateKey)!.sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    const label = fmtDate(dayEntries[0].logged_at, tz);
    blocks.push(`${label}:\n${dayEntries.map(e => formatEntry(e, tz)).join("\n")}`);
  }
  return `Past ${days} days (most recent first):\n\n${blocks.join("\n\n")}`;
}

// ── POST /api/quick-trend ────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { timezone, days: reqDays, excludeTrends = [] } = await req.json();
  const days = Math.min(90, Math.max(7, Number(reqDays) || 30));
  const tz = timezone ?? "UTC";

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

  const entryList = (entries ?? []) as LogEntry[];

  if (entryList.length < 3) {
    return Response.json({ found: false, reason: "insufficient_data" });
  }

  const eventLog = buildEventLog(entryList, tz, days);

  const excludeSection = (excludeTrends as string[]).length > 0
    ? `\n\nDo NOT repeat these already-shown trends:\n${(excludeTrends as string[]).map((t: string) => `- "${t}"`).join("\n")}`
    : "";

  const { object } = await generateObject({
    model: anthropic("claude-3-5-sonnet-latest"),
    schema: z.object({
      found: z.boolean().describe("True if a genuine pattern exists in the data"),
      trend: z.string().describe("One sentence (under 25 words) describing a specific, data-backed health pattern. Name actual foods, symptoms, times, or numbers. No general advice."),
      confidence: z.enum(["low", "medium", "high"]).describe("high = clear repeated pattern with 3+ data points; medium = suggestive but needs more data; low = single occurrence or weak correlation"),
    }),
    prompt: `You are analyzing health tracking data. Find ONE interesting, specific pattern or correlation.

Rules:
- Exactly 1 sentence, under 25 words
- Must be specific: name real foods, symptoms, times, or metrics from the log
- Must be genuinely visible in the data — no speculation
- Prefer correlations (e.g. food→symptom, sleep→energy, alcohol→next-day mood) over simple averages${excludeSection}

${eventLog}`,
    maxTokens: 200,
  });

  return Response.json(object);
}
