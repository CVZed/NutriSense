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

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { entry_type, structured_data, logged_at, ai_confidence, data_source, raw_text } = body;

  if (!entry_type || !structured_data) {
    return new Response("Missing entry_type or structured_data", { status: 400 });
  }

  const { data, error } = await adminClient()
    .from("log_entries")
    .insert({
      user_id: user.id,
      entry_type,
      structured_data,
      logged_at: logged_at ?? new Date().toISOString(),
      ai_confidence: ai_confidence ?? "high",
      data_source: data_source ?? "text",
      raw_text: raw_text ?? null,
    })
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
}
