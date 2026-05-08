import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// PATCH /api/plan-items/[id] — mark done, edit title/description, reorder
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  // Only allow these fields to be updated
  const allowed = ["is_done", "done_at", "title", "description", "display_order", "meal_slot"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return new Response("No valid fields to update", { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { data, error } = await adminSupabase
    .from("plan_items")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("*, saved_meal:saved_meals(*)")
    .single();

  if (error) return new Response("DB error", { status: 500 });
  return Response.json(data);
}

// DELETE /api/plan-items/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const { error } = await adminSupabase
    .from("plan_items")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return new Response("DB error", { status: 500 });
  return new Response(null, { status: 204 });
}
