import type { ActivityLevel, HealthGoal, BiologicalSex } from "@/types/database";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export interface MacroRecommendation {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Mifflin-St Jeor equation
 * Male:   BMR = 10w + 6.25h - 5a + 5
 * Female: BMR = 10w + 6.25h - 5a - 161
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: BiologicalSex
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "female") return Math.round(base - 161);
  // male and prefer_not_to_say both use the male formula as a reasonable default
  return Math.round(base + 5);
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateMacros(
  tdee: number,
  goal: HealthGoal
): MacroRecommendation {
  let calories: number;
  let proteinPct: number;
  let carbsPct: number;
  let fatPct: number;

  switch (goal) {
    case "weight_loss":
      calories = Math.max(1200, tdee - 500); // 500 cal deficit, floor at 1200
      proteinPct = 0.30;
      carbsPct = 0.35;
      fatPct = 0.35;
      break;
    case "muscle_gain":
      calories = tdee + 300;
      proteinPct = 0.30;
      carbsPct = 0.45;
      fatPct = 0.25;
      break;
    case "maintenance":
    case "general_wellness":
    case "symptom_tracking":
    default:
      calories = tdee;
      proteinPct = 0.25;
      carbsPct = 0.45;
      fatPct = 0.30;
      break;
  }

  // Calories per gram: protein = 4, carbs = 4, fat = 9
  return {
    calories,
    protein_g: Math.round((calories * proteinPct) / 4),
    carbs_g: Math.round((calories * carbsPct) / 4),
    fat_g: Math.round((calories * fatPct) / 9),
  };
}

export function formatMacroSummary(macros: MacroRecommendation): string {
  return `${macros.calories} cal/day · ${macros.protein_g}g protein · ${macros.carbs_g}g carbs · ${macros.fat_g}g fat`;
}
