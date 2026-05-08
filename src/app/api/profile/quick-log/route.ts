import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database, QuickLogButton } from "@/types/database";

const MAX_BUTTONS = 12;

// PATCH /api/profile/quick-log — append a QuickLogButton to the profile
// without requiring a full profile form re-submit.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { button } = body as { button: QuickLogButton };

  if (!button?.id || !button?.label || !button?.message) {
    return new Response("button must have id, label, and message", { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  // Fetch current buttons
  const { data: profile, error: fetchError } = await adminSupabase
    .from("profiles")
    .select("quick_log_buttons")
    .eq("id", user.id)
    .single();

  if (fetchError) return new Response("DB error", { status: 500 });

  const current: QuickLogButton[] = Array.isArray(profile?.quick_log_buttons)
    ? (profile.quick_log_buttons as QuickLogButton[])
    : [];

  // Don't add duplicates (same id)
  if (current.some((b) => b.id === button.id)) {
    return Response.json({ quick_log_buttons: current });
  }

  // Cap at MAX_BUTTONS
  if (current.length >= MAX_BUTTONS) {
    return new Response(`Maximum of ${MAX_BUTTONS} quick log buttons reached`, { status: 422 });
  }

  const updated = [...current, { ...button, enabled: true }];

  const { error: updateError } = await adminSupabase
    .from("profiles")
    .update({ quick_log_buttons: updated })
    .eq("id", user.id);

  if (updateError) return new Response("DB error", { status: 500 });
  return Response.json({ quick_log_buttons: updated });
}
