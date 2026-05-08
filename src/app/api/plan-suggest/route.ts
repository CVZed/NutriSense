import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { MealSlot } from "@/types/database";

export const maxDuration = 30;

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "breakfast",
  lunch:     "lunch",
  dinner:    "dinner",
  snack:     "snack",
  workout:   "workout / exercise session",
};

// POST /api/plan-suggest — AI-generated suggestion for a given meal slot / day
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { meal_slot, plan_date, timezone, existing_items_that_day = [] } = body as {
    meal_slot: MealSlot;
    plan_date: string;
    timezone: string;
    existing_items_that_day?: string[];
  };

  // Fetch user profile for goals + dietary notes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("health_goal, calorie_goal, protein_goal_g, dietary_notes")
    .eq("id", user.id)
    .single();

  const goalMap: Record<string, string> = {
    weight_loss:      "losing weight (calorie deficit)",
    maintenance:      "maintaining weight",
    muscle_gain:      "building muscle (calorie surplus)",
    general_wellness: "general wellness",
    symptom_tracking: "tracking symptoms",
  };
  const goalDesc = goalMap[profile?.health_goal ?? "general_wellness"] ?? "general wellness";
  const calorieTarget = profile?.calorie_goal ? `${profile.calorie_goal} cal/day target` : "";
  const dietaryNotes = profile?.dietary_notes ? `Dietary notes: ${profile.dietary_notes}` : "";

  const alreadyPlanned = existing_items_that_day.length > 0
    ? `Already planned today: ${existing_items_that_day.join(", ")}.`
    : "";

  const slotLabel = SLOT_LABELS[meal_slot] ?? meal_slot;
  const isWorkout = meal_slot === "workout";

  const prompt = isWorkout
    ? `Suggest one specific workout or exercise session for ${slotLabel} on ${plan_date}.
User goal: ${goalDesc}. ${calorieTarget} ${dietaryNotes} ${alreadyPlanned}
Return a short workout name (2–5 words) and one sentence describing it with estimated duration.`
    : `Suggest one specific ${slotLabel} meal for ${plan_date} (${timezone}).
User goal: ${goalDesc}. ${calorieTarget} ${dietaryNotes} ${alreadyPlanned}
Return a short meal name (2–5 words) and one sentence describing it with rough calorie estimate.
The suggestion must be practical, realistic, and complement what's already planned.`;

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5" as string),
    schema: z.object({
      title:       z.string().describe("Short name for the meal or workout (2–5 words)"),
      description: z.string().describe("One sentence describing it with key details"),
    }),
    prompt,
    maxTokens: 150,
  });

  return Response.json(object);
}
