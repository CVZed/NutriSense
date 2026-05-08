import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database, SavedMealItem } from "@/types/database";

type FoodData = { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };

function computeTotals(items: SavedMealItem[]) {
  return items.reduce(
    (acc, item) => {
      const sd = item.structured_data as FoodData;
      return {
        total_calories:  acc.total_calories  + (Number(sd.calories  ?? 0)),
        total_protein_g: acc.total_protein_g + (Number(sd.protein_g ?? 0)),
        total_carbs_g:   acc.total_carbs_g   + (Number(sd.carbs_g   ?? 0)),
        total_fat_g:     acc.total_fat_g     + (Number(sd.fat_g     ?? 0)),
      };
    },
    { total_calories: 0, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0 }
  );
}

// GET /api/saved-meals — list all saved meals for the authenticated user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { data, error } = await adminSupabase
    .from("saved_meals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return new Response("DB error", { status: 500 });
  return Response.json(data ?? []);
}

// POST /api/saved-meals — create a saved meal from selected log entries
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { name, emoji, items, meal_type_hint } = body as {
    name: string;
    emoji: string;
    items: SavedMealItem[];
    meal_type_hint?: string;
  };

  if (!name?.trim()) return new Response("name is required", { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return new Response("items must be a non-empty array", { status: 400 });
  }

  // Compute totals server-side — never trust client values
  const totals = computeTotals(items);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { data, error } = await adminSupabase
    .from("saved_meals")
    .insert({
      user_id: user.id,
      name: name.trim(),
      emoji: emoji || "🍽️",
      items,
      ...totals,
      meal_type_hint: meal_type_hint ?? null,
    })
    .select()
    .single();

  if (error) return new Response("DB error", { status: 500 });
  return Response.json(data, { status: 201 });
}
