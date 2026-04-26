import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/export — returns the authenticated user's log entries as CSV.
export async function GET() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entries, error } = await (supabase as any)
    .from("log_entries")
    .select("entry_type, logged_at, structured_data, raw_text")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build CSV
  const rows: string[] = [
    // Header
    ["date", "time", "type", "description", "calories", "protein_g", "carbs_g", "fat_g", "calories_burned", "duration_min", "notes"].join(","),
  ];

  for (const entry of entries ?? []) {
    const loggedAt = new Date(entry.logged_at);
    const date = loggedAt.toLocaleDateString("en-CA"); // YYYY-MM-DD
    const time = loggedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const sd = (entry.structured_data ?? {}) as Record<string, unknown>;

    const row = [
      date,
      time,
      entry.entry_type,
      csvEscape(String(sd.name ?? sd.food_name ?? sd.drink_name ?? sd.exercise_name ?? sd.description ?? entry.raw_text ?? "")),
      sd.calories ?? "",
      sd.protein_g ?? "",
      sd.carbs_g ?? "",
      sd.fat_g ?? "",
      sd.calories_burned_est ?? "",
      sd.duration_min ?? "",
      csvEscape(String(sd.notes ?? sd.mood ?? sd.symptoms ?? "")),
    ];

    rows.push(row.join(","));
  }

  const csv = rows.join("\r\n");
  const filename = `nutrisense-export-${new Date().toLocaleDateString("en-CA")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
