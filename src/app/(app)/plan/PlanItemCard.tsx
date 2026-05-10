"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanItem } from "@/types/database";
import EditPlanItemSheet from "./EditPlanItemSheet";

interface PlanItemCardProps {
  item: PlanItem;
  onRefresh: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

export default function PlanItemCard({ item, onRefresh, dragHandleProps, isDragging }: PlanItemCardProps) {
  const router = useRouter();
  const [done, setDone] = useState(item.is_done);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDone() {
    if (done || loading) return;
    setDone(true); // optimistic
    setLoading(true);
    try {
      await fetch(`/api/plan-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_done: true, done_at: new Date().toISOString() }),
      });
      onRefresh();

      const meal = item.saved_meal;
      let prompt: string;
      if (meal) {
        const itemsList = meal.items
          .map(i => `${i.structured_data.name} ${i.structured_data.quantity ?? ""} ${i.structured_data.unit ?? ""}`.trim())
          .join(", ");
        prompt = `Log ${meal.name}: ${itemsList}`;
      } else {
        prompt = `I just had ${item.title} — log it for me`;
      }
      router.push("/chat?prompt=" + encodeURIComponent(prompt));
    } catch {
      setDone(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    await fetch(`/api/plan-items/${item.id}`, { method: "DELETE" });
    onRefresh();
  }

  const meal = item.saved_meal;
  const hasMacros = meal && (meal.total_calories > 0 || meal.total_protein_g > 0);

  return (
    <>
      <div className={`rounded-xl border px-2.5 py-2 text-xs transition-opacity ${done ? "opacity-50 bg-gray-50 border-gray-100" : "bg-white border-gray-200"} ${isDragging ? "shadow-lg rotate-1" : ""}`}>
        <div className="flex items-start gap-1.5">
          {/* Drag handle */}
          {!done && dragHandleProps && (
            <div
              {...dragHandleProps}
              className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 transition-colors"
              aria-label="Drag to reorder"
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                <circle cx="2.5" cy="2.5" r="1.5" />
                <circle cx="7.5" cy="2.5" r="1.5" />
                <circle cx="2.5" cy="7" r="1.5" />
                <circle cx="7.5" cy="7" r="1.5" />
                <circle cx="2.5" cy="11.5" r="1.5" />
                <circle cx="7.5" cy="11.5" r="1.5" />
              </svg>
            </div>
          )}

          {meal && <span className="text-base leading-none mt-0.5 flex-shrink-0">{meal.emoji}</span>}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-[11px] leading-tight truncate ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
              {item.title}
            </p>
            {item.description && !done && (
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{item.description}</p>
            )}
            {hasMacros && !done && (
              <p className="text-[9px] text-gray-400 mt-1">
                {Math.round(meal!.total_calories)} cal · {Math.round(meal!.total_protein_g)}g P · {Math.round(meal!.total_carbs_g)}g C · {Math.round(meal!.total_fat_g)}g F
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          {done ? (
            <div className="flex items-center gap-1 text-[9px] text-green-600 font-semibold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Done
            </div>
          ) : (
            <button
              onClick={handleDone}
              disabled={loading}
              className="flex-1 text-[10px] font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg py-1 transition-colors disabled:opacity-50"
            >
              ✓ Done
            </button>
          )}
          {!done && (
            <button
              onClick={() => setEditOpen(true)}
              className="text-[10px] text-gray-300 hover:text-gray-500 px-1 transition-colors"
              aria-label="Edit"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <button
            onClick={handleDelete}
            className="text-[10px] text-gray-300 hover:text-red-400 px-1 transition-colors"
            aria-label="Delete"
          >
            ×
          </button>
        </div>
      </div>

      {editOpen && (
        <EditPlanItemSheet
          item={item}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); onRefresh(); }}
        />
      )}
    </>
  );
}
