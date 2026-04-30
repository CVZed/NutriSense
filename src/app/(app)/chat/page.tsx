import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPageClient from "./ChatPageClient";
import type { Message } from "ai";
import { type QuickLogButton, DEFAULT_QUICK_LOG_BUTTONS, type Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ConversationMessage = Pick<Database["public"]["Tables"]["conversation_messages"]["Row"], "id" | "role" | "content">;
type LogEntryLoggedAt = Pick<Database["public"]["Tables"]["log_entries"]["Row"], "logged_at">;
type LogEntryType = Pick<Database["public"]["Tables"]["log_entries"]["Row"], "entry_type">;

export default async function ChatPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  const onboardingComplete = profile?.onboarding_complete ?? false;

  let initialMessages: Message[] = [];

  if (!onboardingComplete) {
    // Pre-seed onboarding greeting
    initialMessages = [
      {
        id: "onboarding-greeting",
        role: "assistant",
        content:
          "Welcome to NutriSense! I'm here to help you track your health and nutrition in a way that actually fits into your life.\n\nBefore we dive in, I'd love to learn a little about you so I can make this experience feel personal. What's your name?",
      },
    ];
  } else {
    // Load recent conversation history (last 40 messages) for context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: history } = await (supabase as any)
      .from("conversation_messages")
      .select("id, role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40) as { data: (ConversationMessage & { created_at?: string })[] | null };

    if (history && history.length > 0) {
      // Reverse to chronological order
      initialMessages = history.reverse().map((msg) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
    }

    // Nudge detection — compute local midnight in user's timezone (profile timezone)
    // setHours(0,0,0,0) on Vercel would give UTC midnight, wrong for non-UTC users
    const nudgeTz = profile?.timezone && profile.timezone !== "UTC" ? profile.timezone : "UTC";
    const nudgeDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: nudgeTz }).format(new Date());
    const nudgeParts = new Intl.DateTimeFormat("en-US", {
      timeZone: nudgeTz, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
    }).formatToParts(new Date());
    const nudgeGet = (type: string) => parseInt(nudgeParts.find(p => p.type === type)?.value ?? "0");
    const [ny, nm, nd, nh, nmin, ns] = [nudgeGet("year"), nudgeGet("month") - 1, nudgeGet("day"), nudgeGet("hour"), nudgeGet("minute"), nudgeGet("second")];
    const nudgeLocalAsUTC = Date.UTC(ny, nm, nd, nh, nmin, ns);
    const nudgeOffsetMs = nudgeLocalAsUTC - Date.now();
    const todayMidnight = new Date(Date.UTC(ny, nm, nd) - nudgeOffsetMs);
    void nudgeDateStr; // used implicitly via ny/nm/nd

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: lastEntry }, { data: todayEntries }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("log_entries")
        .select("logged_at")
        .eq("user_id", user.id)
        .order("logged_at", { ascending: false })
        .limit(1)
        .single() as Promise<{ data: LogEntryLoggedAt | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("log_entries")
        .select("entry_type")
        .eq("user_id", user.id)
        .gte("logged_at", todayMidnight.toISOString()) as Promise<{ data: LogEntryType[] | null }>,
    ]);

    const hoursSinceLastLog = lastEntry
      ? (Date.now() - new Date(lastEntry.logged_at).getTime()) / (1000 * 60 * 60)
      : Infinity;

    const lastMessageTime = history?.[history.length - 1]
      ? new Date((history[history.length - 1] as { created_at?: string }).created_at ?? 0).getTime()
      : 0;
    const hoursSinceLastMessage = (Date.now() - lastMessageTime) / (1000 * 60 * 60);

    const hasSleepToday = todayEntries?.some(e => e.entry_type === "sleep") ?? false;
    const hasFoodToday = todayEntries?.some(e => e.entry_type === "food" || e.entry_type === "drink") ?? false;
    const name = profile?.name ? `, ${profile.name}` : "";
    // Use profile timezone so the nudge hour is correct for the user's local time,
    // not the Vercel server's UTC. Without this, 9 PM EDT = 1 AM UTC → "Good morning".
    const userTz = profile?.timezone && profile.timezone !== "UTC" ? profile.timezone : undefined;
    const hour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: userTz, hour: "numeric", hour12: false }).format(new Date()),
      10,
    );

    // Only nudge when there's been a real gap in the conversation
    if (hoursSinceLastMessage > 2) {
      let nudge: string | null = null;

      if (hour < 11) {
        // Morning — only ask about sleep/breakfast if not already logged
        if (!hasSleepToday && !hasFoodToday) {
          nudge = `Good morning${name}! How did you sleep? And have you had breakfast yet?`;
        } else if (!hasFoodToday) {
          nudge = `Good morning${name}! Have you had breakfast yet?`;
        } else if (!hasSleepToday) {
          nudge = `Morning${name}! How did you sleep last night?`;
        }
        // If both logged, no morning nudge needed
      } else if (hoursSinceLastLog > 4) {
        // Afternoon / evening — nudge only if there's been a logging gap
        nudge = hour < 17
          ? `Hey${name}! It's been a while since your last log. How's your day going — anything to add?`
          : `Evening${name}! How was your day? Anything to log before bed?`;
      }

      if (nudge) {
        initialMessages = [
          ...initialMessages,
          { id: `nudge-${Date.now()}`, role: "assistant", content: nudge },
        ];
      }
    }
  }

  // Resolve quick-log buttons: use profile's saved list if non-empty, else defaults
  const savedButtons = profile?.quick_log_buttons as QuickLogButton[] | null;
  const quickLogButtons = savedButtons && savedButtons.length > 0
    ? savedButtons
    : DEFAULT_QUICK_LOG_BUTTONS;

  return (
    <ChatPageClient
      initialMessages={initialMessages}
      onboardingComplete={onboardingComplete}
      quickLogButtons={quickLogButtons}
    />
  );
}
