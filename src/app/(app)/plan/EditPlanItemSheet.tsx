"use client";

import { useState } from "react";
import type { PlanItem } from "@/types/database";

interface EditPlanItemSheetProps {
  item: PlanItem;
  onClose: () => void;
  onSave: () => void;
}

export default function EditPlanItemSheet({ item, onClose, onSave }: EditPlanItemSheetProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) { setError("Failed to save."); return; }
      onSave();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full md:max-w-2xl bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Edit Plan Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <p className="text-xs text-gray-500 mb-1">Title</p>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Grilled chicken salad"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
            maxLength={100}
            autoFocus
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
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-brand-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
