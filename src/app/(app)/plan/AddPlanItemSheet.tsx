"use client";

import { useState } from "react";
import type { SavedMeal, MealSlot } from "@/types/database";

interface AddPlanItemSheetProps {
  date: string;       // YYYY-MM-DD
  slot: MealSlot;
  savedMeals: SavedMeal[];
  onClose: () => void;
  onAdded: () => void;
}

type SheetTab = "saved" | "custom";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  workout: "Workout",
};

export default function AddPlanItemSheet({
  date,
  slot,
  savedMeals,
  onClose,
  onAdded,
}: AddPlanItemSheetProps) {
  const [activeTab, setActiveTab] = useState<SheetTab>(savedMeals.length > 0 ? "saved" : "custom");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredMeals = savedMeals.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAddSavedMeal(meal: SavedMeal) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plan-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_date: date,
          meal_slot: slot,
          saved_meal_id: meal.id,
          title: meal.name,
        }),
      });
      if (!res.ok) { setError("Failed to add item."); return; }
      onAdded();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustom() {
    if (!title.trim()) { setError("Please enter a title."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plan-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_date: date,
          meal_slot: slot,
          title: title.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) { setError("Failed to add item."); return; }
      onAdded();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAISuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/plan-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, date }),
      });
      if (res.ok) {
        const data = await res.json() as { title?: string; description?: string };
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } catch {
      // silently ignore suggest errors
    } finally {
      setSuggesting(false);
    }
  }

  const displayDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full md:max-w-2xl bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add to {SLOT_LABELS[slot]}</h2>
            <p className="text-xs text-gray-400">{displayDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Tab pills */}
        <div className="px-5 flex-shrink-0">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
            {(["saved", "custom"] as SheetTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "saved" ? "From Saved Meals" : "Custom"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {activeTab === "saved" ? (
            <>
              {savedMeals.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No saved meals yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Select food items in the Timeline tab to save a meal.</p>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search meals…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
                  />
                  <div className="space-y-2">
                    {filteredMeals.map(meal => (
                      <button
                        key={meal.id}
                        onClick={() => handleAddSavedMeal(meal)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-300 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                      >
                        <span className="text-2xl">{meal.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{meal.name}</p>
                          {meal.total_calories > 0 && (
                            <p className="text-xs text-gray-400">
                              {Math.round(meal.total_calories)} cal · {Math.round(meal.total_protein_g)}g P · {Math.round(meal.total_carbs_g)}g C · {Math.round(meal.total_fat_g)}g F
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredMeals.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No meals match &ldquo;{search}&rdquo;</p>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">Title</p>
                <button
                  onClick={handleAISuggest}
                  disabled={suggesting}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  <span>✨</span>
                  <span>{suggesting ? "Suggesting…" : "AI Suggest"}</span>
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`e.g. Grilled chicken salad`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
                maxLength={100}
              />

              <p className="text-xs text-gray-500 mb-1">Notes (optional)</p>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Any extra details…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3 resize-none"
                maxLength={300}
              />

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <button
                onClick={handleAddCustom}
                disabled={saving}
                className="w-full bg-brand-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm"
              >
                {saving ? "Adding…" : "Add to Plan"}
              </button>
            </>
          )}
          {error && activeTab === "saved" && (
            <p className="text-xs text-red-500 mt-2 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
