import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminClient = (): any =>
  createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { error } = await adminClient()
    .from("log_entries")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();

  // Build update payload — structured_data is always updated; logged_at only if provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = { structured_data: body.structured_data, is_edited: true };
  if (body.logged_at) payload.logged_at = body.logged_at;

  const { error } = await adminClient()
    .from("log_entries")
    .update(payload)
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ success: true });
}
