import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database, MealSlot } from "@/types/database";

const VALID_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack", "workout"];

// GET /api/plan-items?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!from || !to) return new Response("from and to are required", { status: 400 });

  // Cap to 14 days to prevent excessive reads
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return new Response("Invalid date format", { status: 400 });
  }
  const diffDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (diffDays > 14) return new Response("Date range exceeds 14 days", { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { data, error } = await adminSupabase
    .from("plan_items")
    .select("*, saved_meal:saved_meals(*)")
    .eq("user_id", user.id)
    .gte("plan_date", from)
    .lte("plan_date", to)
    .order("plan_date", { ascending: true })
    .order("display_order", { ascending: true });

  if (error) return new Response("DB error", { status: 500 });
  return Response.json(data ?? []);
}

// POST /api/plan-items — add one item to a day slot
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { plan_date, meal_slot, saved_meal_id, title, description, display_order } = body as {
    plan_date: string;
    meal_slot: MealSlot;
    saved_meal_id?: string;
    title: string;
    description?: string;
    display_order?: number;
  };

  if (!plan_date) return new Response("plan_date is required", { status: 400 });
  if (!VALID_SLOTS.includes(meal_slot)) return new Response("Invalid meal_slot", { status: 400 });
  if (!title?.trim()) return new Response("title is required", { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { data, error } = await adminSupabase
    .from("plan_items")
    .insert({
      user_id: user.id,
      plan_date,
      meal_slot,
      saved_meal_id: saved_meal_id ?? null,
      title: title.trim(),
      description: description ?? null,
      display_order: display_order ?? 0,
    })
    .select("*, saved_meal:saved_meals(*)")
    .single();

  if (error) return new Response("DB error", { status: 500 });
  return Response.json(data, { status: 201 });
}
