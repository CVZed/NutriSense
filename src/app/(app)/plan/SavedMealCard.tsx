"use client";

import { useState } from "react";
import type { SavedMeal } from "@/types/database";

interface SavedMealCardProps {
  meal: SavedMeal;
  onRefresh: () => void;
}

export default function SavedMealCard({ meal, onRefresh }: SavedMealCardProps) {
  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [logError, setLogError] = useState(false);
  const [addingPin, setAddingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleLogNow() {
    if (logging || logSuccess) return;
    setLogging(true);
    setLogError(false);
    try {
      await Promise.all(
        meal.items.map(item =>
          fetch("/api/log-entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entry_type: item.entry_type,
              structured_data: item.structured_data,
              ai_confidence: "high",
              data_source: "text",
              raw_text: item.structured_data.name,
            }),
          }).then(res => { if (!res.ok) throw new Error(); })
        )
      );
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 2000);
    } catch {
      setLogError(true);
      setTimeout(() => setLogError(false), 2000);
    } finally {
      setLogging(false);
    }
  }

  function buildLogPrompt(m: SavedMeal): string {
    if (m.items.length === 0) return `Log ${m.name}`;
    const itemsList = m.items
      .map(i => `${i.structured_data.name} ${i.structured_data.quantity ?? ""} ${i.structured_data.unit ?? ""}`.trim())
      .join(", ");
    return `Log ${m.name}: ${itemsList}`;
  }

  async function handlePinToChat() {
    setAddingPin(true);
    try {
      const button = {
        id: crypto.randomUUID(),
        emoji: meal.emoji,
        label: meal.name,
        message: buildLogPrompt(meal),
        enabled: true,
        saved_meal_items: meal.items,  // enables direct-post bypass of AI
      };
      const res = await fetch("/api/profile/quick-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ button }),
      });
      if (res.ok) {
        setPinSuccess(true);
        setTimeout(() => setPinSuccess(false), 2000);
        onRefresh();
      }
    } finally {
      setAddingPin(false);
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

  function logButtonLabel() {
    if (logError) return "Error — try again";
    if (logSuccess) return "✓ Logged!";
    if (logging) return "Logging…";
    return "Log Now";
  }

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
          disabled={logging || logSuccess}
          className={`flex-1 text-xs font-semibold py-2 rounded-xl transition-colors disabled:opacity-70 ${
            logError
              ? "bg-red-500 text-white"
              : logSuccess
              ? "bg-green-500 text-white"
              : "bg-brand-500 text-white hover:bg-brand-600"
          }`}
        >
          {logButtonLabel()}
        </button>
        <button
          onClick={handlePinToChat}
          disabled={addingPin || pinSuccess}
          className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-colors disabled:opacity-60 ${
            pinSuccess
              ? "bg-green-50 border-green-300 text-green-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {pinSuccess ? "✓ Pinned!" : addingPin ? "Pinning…" : "Pin to Chat"}
        </button>
      </div>
    </div>
  );
}
