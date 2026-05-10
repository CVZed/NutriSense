"use client";

import SavedMealCard from "./SavedMealCard";
import type { SavedMeal } from "@/types/database";

interface MealsViewProps {
  savedMeals: SavedMeal[];
  onRefresh: () => void;
}

export default function MealsView({ savedMeals, onRefresh }: MealsViewProps) {
  if (savedMeals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <span className="text-3xl">🍽️</span>
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">No saved meals yet</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Go to the Today tab, tap <strong>Select</strong>, choose your food items, and tap <strong>Save as Meal</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {savedMeals.map(meal => (
          <SavedMealCard
            key={meal.id}
            meal={meal}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}
