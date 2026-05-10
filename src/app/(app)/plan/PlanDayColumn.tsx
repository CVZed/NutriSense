"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

// Thin wrapper that makes a single PlanItemCard sortable
function SortablePlanItemCard({ item, onRefresh }: { item: PlanItem; onRefresh: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlanItemCard
        item={item}
        onRefresh={onRefresh}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function PlanDayColumn({
  date,
  isToday,
  items,
  savedMeals,
  onRefresh,
}: PlanDayColumnProps) {
  const [addSheet, setAddSheet] = useState<MealSlot | null>(null);
  const [orderedItems, setOrderedItems] = useState<PlanItem[]>(items);

  // Re-sync when parent data changes (e.g. after router.refresh())
  useEffect(() => { setOrderedItems(items); }, [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event: DragEndEvent, slot: MealSlot) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const slotItems = orderedItems.filter(i => i.meal_slot === slot);
    const oldIndex = slotItems.findIndex(i => i.id === active.id);
    const newIndex = slotItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(slotItems, oldIndex, newIndex);

    // Assign new display_order values (1000-spaced)
    const updates = reordered.map((item, idx) => ({ ...item, display_order: (idx + 1) * 1000 }));

    // Optimistically update state
    setOrderedItems(prev => {
      const others = prev.filter(i => i.meal_slot !== slot);
      return [...others, ...updates].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    });

    // Persist only items whose display_order actually changed
    const changed = updates.filter((u, idx) => u.display_order !== slotItems[idx].display_order);
    await Promise.all(
      changed.map(u =>
        fetch(`/api/plan-items/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_order: u.display_order }),
        })
      )
    );
  }

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
          const slotItems = orderedItems
            .filter(i => i.meal_slot === slot)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

          return (
            <div key={slot} className="px-2 pt-2">
              {/* Slot label */}
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px]">{emoji}</span>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
              </div>

              {/* Items with drag support */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={e => handleDragEnd(e, slot)}
              >
                <SortableContext items={slotItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {slotItems.map(item => (
                      <SortablePlanItemCard
                        key={item.id}
                        item={item}
                        onRefresh={onRefresh}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

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
