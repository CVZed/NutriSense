"use client";

import { useState } from "react";
import PlanItemCard from "./PlanItemCard";
import AddPlanItemSheet from "./AddPlanItemSheet";
import type { PlanItem, SavedMeal, MealSlot } from "@/types/database";

const SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: "breakfast", label: "Breakfast", emoji: "🌅" },
  { slot: "lunch",     label: "Lunch",     emoji: "☀️" },
  { slot: "dinner",    label: "Dinner",    emoji: "🌙" },
  { slot: "snack",     label: "Snack",     emoji: "🍎" },
  { slot: "workout",   label: "Workout",   emoji: "💪" },
];

interface PlanDayColumnProps {
  date: string;          // YYYY-MM-DD
  isToday: boolean;
  items: PlanItem[];
  savedMeals: SavedMeal[];
  onRefresh: () => void;
}

function formatDateHeader(dateStr: string): string {
  // Parse as local date (noon UTC to avoid date-shift)
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

export default function PlanDayColumn({
  date,
  isToday,
  items,
  savedMeals,
  onRefresh,
}: PlanDayColumnProps) {
  const [addSheet, setAddSheet] = useState<MealSlot | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Date header */}
      <div className={`flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 flex-shrink-0 ${isToday ? "bg-brand-50" : "bg-white"}`}>
        <span className={`text-xs font-semibold ${isToday ? "text-brand-700" : "text-gray-700"}`}>
          {formatDateHeader(date)}
        </span>
        {isToday && (
          <span className="text-[9px] font-bold uppercase tracking-wide bg-brand-500 text-white px-1.5 py-0.5 rounded-full">
            Today
          </span>
        )}
      </div>

      {/* Slot sections — scrollable */}
      <div className="flex-1 overflow-y-auto pb-4">
        {SLOTS.map(({ slot, label, emoji }) => {
          const slotItems = items.filter(i => i.meal_slot === slot);
          return (
            <div key={slot} className="px-2 pt-2">
              {/* Slot label */}
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px]">{emoji}</span>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                {slotItems.map(item => (
                  <PlanItemCard
                    key={item.id}
                    item={item}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>

              {/* Add button */}
              <button
                onClick={() => setAddSheet(slot)}
                className="mt-1.5 w-full text-[10px] text-gray-400 hover:text-brand-600 hover:bg-brand-50 py-1 rounded-lg border border-dashed border-gray-200 hover:border-brand-300 transition-colors"
              >
                + Add
              </button>
            </div>
          );
        })}
      </div>

      {/* Add item sheet */}
      {addSheet && (
        <AddPlanItemSheet
          date={date}
          slot={addSheet}
          savedMeals={savedMeals}
          onClose={() => setAddSheet(null)}
          onAdded={() => { setAddSheet(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
