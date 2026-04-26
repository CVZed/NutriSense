import { anthropic } from "@ai-sdk/anthropic";
import { createDataStreamResponse, streamText, tool } from "ai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_SYSTEM_PROMPT } from "@/lib/prompts/onboarding";
import { buildChatSystemPrompt } from "@/lib/prompts/chat";
import { calculateBMR, calculateTDEE, calculateMacros, formatMacroSummary } from "@/lib/bmr";
import { searchFood } from "@/lib/usda";
import type { ActivityLevel, BiologicalSex, HealthGoal, Database } from "@/types/database";

/** Resize image buffer to max 1568px / 85% JPEG if over 4 MB or 1568px. */
async function resizeImageBuffer(buf: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Only bother if the image is large enough to cause issues
  if (buf.length <= 4 * 1024 * 1024) return { buffer: buf, mimeType };
  try {
    // Dynamic import so a missing native binding doesn't crash the whole route
    const sharp = (await import("sharp")).default;
    const resized = await sharp(buf)
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer: resized, mimeType: "image/jpeg" };
  } catch {
    // sharp unavailable or failed — return original and hope Anthropic accepts it
    return { buffer: buf, mimeType };
  }
}

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const maxDuration = 60;

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // ── Profile ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles").select("*").eq("id", user.id).single() as { data: Profile | null };

  // ── Request ───────────────────────────────────────────────────────────────
  const { messages, sessionId, timezone, imageUrl, imageBase64, imageMimeType: reqMimeType } = await req.json();

  // ── Admin client (bypasses RLS for server-side writes) ───────────────────
  // Cast to any once so all .from() calls resolve without GenericSchema inference issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSupabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const isOnboarding = !profile?.onboarding_complete;

  // ── Resolve timezone: profile wins, fall back to request, then UTC ────────
  const profileTimezone = profile?.timezone;
  const resolvedTimezone: string = profileTimezone && profileTimezone !== "UTC"
    ? profileTimezone
    : (timezone ?? "UTC");

  // Auto-save detected timezone to profile if not yet set
  if (timezone && (!profileTimezone || profileTimezone === "UTC") && !isOnboarding) {
    // fire-and-forget — don't block the response
    adminSupabase.from("profiles")
      .update({ timezone: timezone })
      .eq("id", user.id)
      .then(() => {});
  }

  // ── Save incoming user message ────────────────────────────────────────────
  const latestMessage = messages[messages.length - 1];
  if (latestMessage?.role === "user" && sessionId) {
    await adminSupabase.from("conversation_messages").insert({
      user_id: user.id,
      session_id: sessionId,
      role: "user",
      content: typeof latestMessage.content === "string"
        ? latestMessage.content
        : JSON.stringify(latestMessage.content),
      linked_entry_ids: [],
    });
  }

  // ── Build image content for Anthropic ───────────────────────────────────────
  // Two strategies:
  //  A) base64 from client → small Buffer → pass to Anthropic (avoids slow SDK encoding for large buffers)
  //  B) public Supabase URL → pass URL object → Anthropic fetches it directly (best for large images)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let imageContentPart: any = null;

  if (imageBase64) {
    // Strategy A: client sent base64 — decode, resize if needed, pass as buffer
    let buf = Buffer.from(imageBase64, "base64");
    const mimeType = reqMimeType ?? "image/jpeg";
    if (buf.length > 4 * 1024 * 1024) {
      const resized = await resizeImageBuffer(buf, mimeType);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buf = resized.buffer as any;
    }
    imageContentPart = { type: "image", image: buf, mimeType };
  } else if (imageUrl) {
    // Strategy B: pass the public URL directly — Anthropic fetches it server-to-server.
    // No encoding overhead, works for any size image, handles format detection automatically.
    imageContentPart = { type: "image", image: new URL(imageUrl) };
  }

  // ── Inject image as vision content part on the last user message ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processedMessages: any[] = messages;
  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  if (imageContentPart && lastUserMsg?.role === "user") {
    const textContent =
      typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg.content)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (lastUserMsg.content as any[]).find((p: any) => p.type === "text")?.text ?? ""
        : "";
    processedMessages = [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: [
          imageContentPart,
          {
            type: "text",
            text: textContent.trim() || "Please analyse this image and log the nutritional information.",
          },
        ],
      },
    ];
  }

  const systemPrompt = isOnboarding
    ? ONBOARDING_SYSTEM_PROMPT
    : buildChatSystemPrompt(profile as Profile, new Date().toISOString(), resolvedTimezone);

  const createdEntryIds: string[] = [];
  const streamedEntries: Record<string, unknown>[] = [];

  // ── Stream response ───────────────────────────────────────────────────────
  return createDataStreamResponse({
    execute: async (dataStream) => {
      const result = streamText({
        model: anthropic("claude-sonnet-4-6"),
        system: systemPrompt,
        messages: processedMessages,
        maxTokens: 1024,
        maxSteps: 6,

        tools: isOnboarding
          ? {
              complete_onboarding: tool({
                description: "Save the user's profile data and complete onboarding.",
                parameters: z.object({
                  name: z.string(),
                  age: z.number().int().min(1).max(129),
                  biological_sex: z.enum(["male", "female", "prefer_not_to_say"]),
                  height_cm: z.number().positive(),
                  weight_kg: z.number().positive(),
                  activity_level: z.enum(["sedentary", "lightly_active", "moderately_active", "very_active", "extra_active"]),
                  health_goal: z.enum(["weight_loss", "maintenance", "muscle_gain", "general_wellness", "symptom_tracking"]),
                  dietary_notes: z.string().optional(),
                }),
                execute: async ({ name, age, biological_sex, height_cm, weight_kg, activity_level, health_goal, dietary_notes }) => {
                  const bmr = calculateBMR(weight_kg, height_cm, age, biological_sex as BiologicalSex);
                  const tdee = calculateTDEE(bmr, activity_level as ActivityLevel);
                  const macros = calculateMacros(tdee, health_goal as HealthGoal);
                  const { error } = await adminSupabase.from("profiles").update({
                    name, age,
                    biological_sex: biological_sex as BiologicalSex,
                    height_cm, weight_kg,
                    activity_level: activity_level as ActivityLevel,
                    health_goal: health_goal as HealthGoal,
                    dietary_notes: dietary_notes ?? null,
                    calorie_goal: macros.calories,
                    protein_goal_g: macros.protein_g,
                    carbs_goal_g: macros.carbs_g,
                    fat_goal_g: macros.fat_g,
                    ai_recommended_calories: macros.calories,
                    ai_recommended_macros: macros,
                    onboarding_complete: true,
                  }).eq("id", user.id);
                  if (error) return { success: false, error: error.message };
                  return { success: true, summary: formatMacroSummary(macros), ...macros };
                },
              }),
            }
          : {
              search_food: tool({
                description: "Search the USDA database for a food item to get nutritional data per 100g. Call this before logging any food or drink entry.",
                parameters: z.object({
                  query: z.string().describe("Food name to search"),
                }),
                execute: async ({ query }) => {
                  const result = await searchFood(query);
                  if (!result) {
                    return { found: false, message: "No USDA match. Use best estimate with confidence 'low'." };
                  }
                  return { found: true, ...result };
                },
              }),

              create_log_entry: tool({
                description: "Save a log entry for food, drink, exercise, sleep, symptom, or mood.",
                parameters: z.object({
                  entry_type: z.enum(["food", "drink", "exercise", "sleep", "symptom", "mood", "note"]),
                  logged_at: z.string().describe("ISO 8601 timestamp"),
                  raw_text: z.string(),
                  ai_confidence: z.enum(["low", "medium", "high"]),
                  data_source: z.enum(["text", "ai_estimate"]).default("text"),
                  // Food/drink
                  food_name: z.string().optional(),
                  quantity: z.number().optional(),
                  unit: z.string().optional(),
                  estimated_grams: z.number().optional(),
                  calories: z.number().optional(),
                  protein_g: z.number().optional(),
                  carbs_g: z.number().optional(),
                  fat_g: z.number().optional(),
                  fiber_g: z.number().optional(),
                  sodium_mg: z.number().optional(),
                  sugar_g: z.number().optional(),
                  servings_count: z.number().optional().default(1),
                  // Exercise
                  activity_type: z.string().optional(),
                  duration_min: z.number().optional(),
                  intensity: z.enum(["low", "moderate", "high"]).optional(),
                  calories_burned_est: z.number().optional(),
                  // Sleep
                  sleep_start: z.string().optional(),
                  sleep_end: z.string().optional(),
                  sleep_duration_min: z.number().optional(),
                  sleep_quality: z.enum(["poor", "fair", "good", "great"]).optional(),
                  // Symptom
                  symptom_name: z.string().optional(),
                  severity: z.number().int().min(1).max(5).optional(),
                  body_area: z.string().optional(),
                  // Mood
                  mood_label: z.string().optional(),
                  energy_level: z.number().int().min(1).max(5).optional(),
                  hunger_level: z.number().int().min(1).max(5).optional(),
                  // Shared
                  notes: z.string().optional(),
                }),
                execute: async (params) => {
                  let structuredData: Record<string, unknown> = {};
                  switch (params.entry_type) {
                    case "food":
                    case "drink":
                      structuredData = {
                        name: params.food_name, quantity: params.quantity, unit: params.unit,
                        estimated_grams: params.estimated_grams,
                        calories: params.calories ?? 0, protein_g: params.protein_g ?? 0,
                        carbs_g: params.carbs_g ?? 0, fat_g: params.fat_g ?? 0,
                        fiber_g: params.fiber_g, sodium_mg: params.sodium_mg,
                        sugar_g: params.sugar_g, servings_count: params.servings_count ?? 1,
                      };
                      break;
                    case "exercise":
                      structuredData = {
                        activity_type: params.activity_type, duration_min: params.duration_min,
                        intensity: params.intensity, calories_burned_est: params.calories_burned_est ?? 0,
                        notes: params.notes,
                      };
                      break;
                    case "sleep":
                      structuredData = {
                        start_time: params.sleep_start, end_time: params.sleep_end,
                        duration_min: params.sleep_duration_min, quality_signal: params.sleep_quality,
                        notes: params.notes,
                      };
                      break;
                    case "symptom":
                      structuredData = {
                        symptom_name: params.symptom_name, severity: params.severity,
                        body_area: params.body_area, notes: params.notes,
                      };
                      break;
                    case "mood":
                      structuredData = {
                        mood_label: params.mood_label, energy_level: params.energy_level,
                        hunger_level: params.hunger_level, notes: params.notes,
                      };
                      break;
                    default:
                      structuredData = { notes: params.notes };
                  }

                  const { data: entry, error } = await adminSupabase
                    .from("log_entries")
                    .insert({
                      user_id: user.id,
                      logged_at: params.logged_at,
                      entry_type: params.entry_type,
                      raw_text: params.raw_text,
                      structured_data: structuredData,
                      ai_confidence: params.ai_confidence,
                      data_source: params.data_source ?? "text",
                      is_edited: false,
                      raw_image_url: imageUrl ?? null,
                    })
                    .select("id")
                    .single();

                  if (error) {
                    console.error("Failed to create log entry:", error);
                    return { success: false, error: error.message };
                  }

                  createdEntryIds.push(entry.id);

                  const summary: Record<string, unknown> = {
                    success: true,
                    entry_id: entry.id,
                    entry_type: params.entry_type,
                    logged_at: params.logged_at,
                    raw_image_url: imageUrl ?? null,
                  };

                  if (params.entry_type === "food" || params.entry_type === "drink") {
                    Object.assign(summary, {
                      name: params.food_name, quantity: params.quantity, unit: params.unit,
                      calories: params.calories, protein_g: params.protein_g,
                      carbs_g: params.carbs_g, fat_g: params.fat_g,
                    });
                  } else if (params.entry_type === "exercise") {
                    Object.assign(summary, {
                      activity_type: params.activity_type, duration_min: params.duration_min,
                      intensity: params.intensity, calories_burned_est: params.calories_burned_est,
                    });
                  } else if (params.entry_type === "sleep") {
                    Object.assign(summary, {
                      duration_min: params.sleep_duration_min, quality_signal: params.sleep_quality,
                    });
                  } else if (params.entry_type === "symptom") {
                    Object.assign(summary, {
                      symptom_name: params.symptom_name, severity: params.severity,
                      body_area: params.body_area,
                    });
                  } else if (params.entry_type === "mood") {
                    Object.assign(summary, {
                      mood_label: params.mood_label, energy_level: params.energy_level,
                      hunger_level: params.hunger_level,
                    });
                  }

                  streamedEntries.push(summary);
                  // Write the card to the stream immediately while stream is still open
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dataStream.writeData({ type: "log_entries", entries: [summary] } as any);
                  return summary;
                },
              }),
            },

        onFinish: async ({ text }) => {
          // Persist AI message
          if (sessionId && text.trim()) {
            await adminSupabase.from("conversation_messages").insert({
              user_id: user.id,
              session_id: sessionId,
              role: "assistant",
              content: text,
              linked_entry_ids: createdEntryIds,
            });
          }
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}
