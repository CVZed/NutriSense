export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateBMR } from "@/lib/bmr";
import TodayClient from "./TodayClient";
import type { Database } from "@/types/database";
import type { BiologicalSex } from "@/types/database";

type LogEntry = Database["public"]["Tables"]["log_entries"]["Row"];

export default async function TimelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const now = new Date();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  type Profile = Database["public"]["Tables"]["profiles"]["Row"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: profile }, { data: entries }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user.id).single() as Promise<{ data: Profile | null }>,
    sb.from("log_entries").select("*").eq("user_id", user.id)
      .gte("logged_at", windowStart.toISOString())
      .order("logged_at", { ascending: true }) as Promise<{ data: LogEntry[] | null }>,
  ]);

  const bmr =
    profile?.weight_kg && profile?.height_cm && profile?.age && profile?.biological_sex
      ? calculateBMR(
          profile.weight_kg,
          profile.height_cm,
          profile.age,
          profile.biological_sex as BiologicalSex
        )
      : 0;

  const goals = {
    calories: profile?.calorie_goal ?? 2000,
    protein_g: profile?.protein_goal_g ?? 150,
    carbs_g: profile?.carbs_goal_g ?? 200,
    fat_g: profile?.fat_goal_g ?? 65,
  };

  return (
    <TodayClient
      entries={(entries ?? []) as LogEntry[]}
      goals={goals}
      bmr={bmr}
      windowStartIso={windowStart.toISOString()}
      nowIso={now.toISOString()}
      todayLabel={now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
    />
  );
}
