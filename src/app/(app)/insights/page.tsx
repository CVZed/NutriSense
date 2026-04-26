import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InsightsClient from "./InsightsClient";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles").select("*").eq("id", user.id).single() as { data: Profile | null };

  // Last 7 days inclusive of today
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entries } = await (supabase as any)
    .from("log_entries")
    .select("entry_type, logged_at, structured_data")
    .eq("user_id", user.id)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: true }) as { data: LogEntry[] | null };

  const timezone: string = profile?.timezone ?? "UTC";

  return (
    <InsightsClient
      entries={entries ?? []}
      profile={profile}
      timezone={timezone}
    />
  );
}

type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];
