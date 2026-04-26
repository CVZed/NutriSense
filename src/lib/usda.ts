// USDA FoodData Central API
// Docs: https://fdc.nal.usda.gov/api-guide.html
// Free API key from: https://fdc.nal.usda.gov/api-guide.html (DEMO_KEY works for dev)

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const API_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";

// Nutrient IDs in the USDA database (values are per 100g)
const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sodium: 1093,
  sugar: 2000,
} as const;

export interface UsdaNutrition {
  name: string;
  fdcId: number;
  // All values are per 100g
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  fiber_per_100g: number | null;
  sodium_per_100g: number | null;
  sugar_per_100g: number | null;
}

interface UsdaFoodNutrient {
  nutrientId: number;
  value: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: UsdaFoodNutrient[];
}

interface UsdaSearchResponse {
  foods: UsdaFood[];
  totalHits: number;
}

/**
 * Search USDA FoodData Central for a food item.
 * Returns the best match with per-100g nutrition data.
 * The AI is responsible for scaling values to the actual portion size.
 */
export async function searchFood(query: string): Promise<UsdaNutrition | null> {
  try {
    const params = new URLSearchParams({
      query,
      api_key: API_KEY,
      // Prefer Foundation and SR Legacy foods — more complete nutrient profiles
      dataType: "Foundation,SR Legacy,Survey (FNDDS)",
      pageSize: "5",
    });

    const res = await fetch(`${USDA_BASE_URL}/foods/search?${params}`, {
      next: { revalidate: 86400 }, // Cache results for 24h — nutrition data doesn't change
    });

    if (!res.ok) {
      console.error("USDA API error:", res.status, await res.text());
      return null;
    }

    const data: UsdaSearchResponse = await res.json();

    if (!data.foods?.length) return null;

    // Pick the first result with a complete macronutrient profile
    const food = data.foods.find((f) =>
      f.foodNutrients.some((n) => n.nutrientId === NUTRIENT_IDS.calories)
    ) ?? data.foods[0];

    const getNutrient = (id: number): number | null => {
      const nutrient = food.foodNutrients.find((n) => n.nutrientId === id);
      return nutrient?.value ?? null;
    };

    return {
      name: food.description,
      fdcId: food.fdcId,
      calories_per_100g: getNutrient(NUTRIENT_IDS.calories) ?? 0,
      protein_per_100g: getNutrient(NUTRIENT_IDS.protein) ?? 0,
      fat_per_100g: getNutrient(NUTRIENT_IDS.fat) ?? 0,
      carbs_per_100g: getNutrient(NUTRIENT_IDS.carbs) ?? 0,
      fiber_per_100g: getNutrient(NUTRIENT_IDS.fiber),
      sodium_per_100g: getNutrient(NUTRIENT_IDS.sodium),
      sugar_per_100g: getNutrient(NUTRIENT_IDS.sugar),
    };
  } catch (err) {
    console.error("USDA search failed:", err);
    return null;
  }
}

/**
 * Scale per-100g values to an actual portion weight.
 */
export function scaleNutrition(
  nutrition: UsdaNutrition,
  grams: number
): Omit<UsdaNutrition, "name" | "fdcId"> & { grams: number } {
  const factor = grams / 100;
  return {
    grams,
    calories_per_100g: Math.round(nutrition.calories_per_100g * factor),
    protein_per_100g: Math.round(nutrition.protein_per_100g * factor * 10) / 10,
    fat_per_100g: Math.round(nutrition.fat_per_100g * factor * 10) / 10,
    carbs_per_100g: Math.round(nutrition.carbs_per_100g * factor * 10) / 10,
    fiber_per_100g:
      nutrition.fiber_per_100g !== null
        ? Math.round(nutrition.fiber_per_100g * factor * 10) / 10
        : null,
    sodium_per_100g:
      nutrition.sodium_per_100g !== null
        ? Math.round(nutrition.sodium_per_100g * factor)
        : null,
    sugar_per_100g:
      nutrition.sugar_per_100g !== null
        ? Math.round(nutrition.sugar_per_100g * factor * 10) / 10
        : null,
  };
}
