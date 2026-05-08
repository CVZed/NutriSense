"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SavedMeal } from "@/types/database";

interface SavedMealCardProps {
  meal: SavedMeal;
  onRefresh: () => void;
}

export default function SavedMealCard({ meal, onRefresh }: SavedMealCardProps) {
  const router = useRouter();
  const [addingQuickLog, setAddingQuickLog] = useState(false);
  const [quickLogSuccess, setQuickLogSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function buildLogPrompt(m: SavedMeal): string {
    if (m.items.length === 0) return `Log ${m.name}`;
    const itemsList = m.items
      .map(i => `${i.structured_data.name} ${i.structured_data.quantity ?? ""} ${i.structured_data.unit ?? ""}`.trim())
      .join(", ");
    return `Log ${m.name}: ${itemsList}`;
  }

  function handleLogNow() {
    router.push("/chat?prompt=" + encodeURIComponent(buildLogPrompt(meal)));
  }

  async function handleAddToQuickLog() {
    setAddingQuickLog(true);
    try {
      const button = {
        id: crypto.randomUUID(),
        emoji: meal.emoji,
        label: meal.name,
        message: buildLogPrompt(meal),
        enabled: true,
      };
      const res = await fetch("/api/profile/quick-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ button }),
      });
      if (res.ok) {
        setQuickLogSuccess(true);
        setTimeout(() => setQuickLogSuccess(false), 2000);
        onRefresh();
      }
    } finally {
      setAddingQuickLog(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${meal.name}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/saved-meals/${meal.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  const hasMacros = meal.total_calories > 0 || meal.total_protein_g > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
      {/* Top row: emoji + name + delete */}
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none mt-0.5">{meal.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{meal.name}</p>
          <p className="text-xs text-gray-400">{meal.items.length} item{meal.items.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none disabled:opacity-50"
          aria-label="Delete meal"
        >
          ×
        </button>
      </div>

      {/* Macro strip */}
      {hasMacros && (
        <div className="flex gap-3 text-xs">
          <div className="flex flex-col items-center flex-1 bg-gray-50 rounded-xl py-1.5">
            <span className="font-semibold text-gray-800">{Math.round(meal.total_calories)}</span>
            <span className="text-[9px] text-gray-400 uppercase tracking-wide">cal</span>
          </div>
          <div className="flex flex-col items-center flex-1 bg-blue-50 rounded-xl py-1.5">
            <span className="font-semibold text-blue-700">{Math.round(meal.total_protein_g)}g</span>
            <span className="text-[9px] text-blue-400 uppercase tracking-wide">protein</span>
          </div>
          <div className="flex flex-col items-center flex-1 bg-yellow-50 rounded-xl py-1.5">
            <span className="font-semibold text-yellow-700">{Math.round(meal.total_carbs_g)}g</span>
            <span className="text-[9px] text-yellow-500 uppercase tracking-wide">carbs</span>
          </div>
          <div className="flex flex-col items-center flex-1 bg-orange-50 rounded-xl py-1.5">
            <span className="font-semibold text-orange-700">{Math.round(meal.total_fat_g)}g</span>
            <span className="text-[9px] text-orange-400 uppercase tracking-wide">fat</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleLogNow}
          className="flex-1 bg-brand-500 text-white text-xs font-semibold py-2 rounded-xl hover:bg-brand-600 transition-colors"
        >
          Log Now
        </button>
        <button
          onClick={handleAddToQuickLog}
          disabled={addingQuickLog || quickLogSuccess}
          className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-colors disabled:opacity-60 ${
            quickLogSuccess
              ? "bg-green-50 border-green-300 text-green-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {quickLogSuccess ? "✓ Added!" : addingQuickLog ? "Adding…" : "Quick Log"}
        </button>
      </div>
    </div>
  );
}
