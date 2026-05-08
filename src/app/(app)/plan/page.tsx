import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlanPageClient from "./PlanPageClient";
import type { Database, PlanItem, SavedMeal } from "@/types/database";

export const dynamic = "force-dynamic";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single() as { data: Pick<Profile, "timezone"> | null };

  // Compute 7-day window: yesterday through +5 days in user's timezone
  const userTz = profile?.timezone && profile.timezone !== "UTC" ? profile.timezone : "UTC";

  function localDateStr(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return new Intl.DateTimeFormat("en-CA", { timeZone: userTz }).format(d);
  }

  const fromDate = localDateStr(-1); // yesterday
  const toDate   = localDateStr(5);  // +5 days
  const todayDate = localDateStr(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: planItems }, { data: savedMeals }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("plan_items")
      .select("*, saved_meal:saved_meals(*)")
      .eq("user_id", user.id)
      .gte("plan_date", fromDate)
      .lte("plan_date", toDate)
      .order("display_order", { ascending: true }) as Promise<{ data: PlanItem[] | null }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("saved_meals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as Promise<{ data: SavedMeal[] | null }>,
  ]);

  return (
    <PlanPageClient
      planItems={planItems ?? []}
      savedMeals={savedMeals ?? []}
      fromDate={fromDate}
      toDate={toDate}
      todayDate={todayDate}
    />
  );
}
