import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// DELETE /api/saved-meals/[id]
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
    .from("saved_meals")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id); // belt-and-suspenders ownership check

  if (error) return new Response("DB error", { status: 500 });
  return new Response(null, { status: 204 });
}
