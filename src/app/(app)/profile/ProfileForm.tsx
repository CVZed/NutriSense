"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Database } from "@/types/database";
import { type QuickLogButton, DEFAULT_QUICK_LOG_BUTTONS } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface ProfileFormProps {
  profile: Profile | null;
  saveProfile: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
  { value: "lightly_active", label: "Lightly active (1–3 days/week)" },
  { value: "moderately_active", label: "Moderately active (3–5 days/week)" },
  { value: "very_active", label: "Very active (6–7 days/week)" },
  { value: "extra_active", label: "Extra active (physical job or 2x/day)" },
];

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "Lose weight" },
  { value: "maintenance", label: "Maintain weight" },
  { value: "muscle_gain", label: "Build muscle" },
  { value: "general_wellness", label: "General wellness" },
  { value: "symptom_tracking", label: "Track symptoms / understand my health" },
];

const RETENTION_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days (default)" },
  { value: "180", label: "180 days" },
  { value: "36500", label: "Unlimited" },
];

export default function ProfileForm({ profile, saveProfile, signOut }: ProfileFormProps) {
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved") === "true";

  // Auto-detect browser timezone as a fallback suggestion
  const [detectedTz, setDetectedTz] = useState("");
  useEffect(() => {
    setDetectedTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const aiMacros = profile?.ai_recommended_macros as {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  } | null;

  return (
    <div className="h-[calc(100dvh-64px)] overflow-y-auto">
      <div className="px-4 pt-6 pb-8 max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Your goals and biometrics
          </p>
        </div>

        {saved && (
          <div className="mb-4 p-3 rounded-xl bg-brand-50 border border-brand-100 text-sm text-brand-700">
            Profile saved successfully.
          </div>
        )}

        <form action={saveProfile} className="space-y-6">
          {/* ── Personal Info ─────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Personal Info
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              <FormRow label="Name">
                <input
                  name="name"
                  type="text"
                  defaultValue={profile?.name ?? ""}
                  placeholder="Your name"
                  className="form-input"
                />
              </FormRow>
              <FormRow label="Age">
                <input
                  name="age"
                  type="number"
                  defaultValue={profile?.age ?? ""}
                  placeholder="—"
                  min={1}
                  max={129}
                  className="form-input"
                />
              </FormRow>
              <FormRow label="Height (cm)">
                <input
                  name="height_cm"
                  type="number"
                  defaultValue={profile?.height_cm ?? ""}
                  placeholder="—"
                  step="0.1"
                  className="form-input"
                />
              </FormRow>
              <FormRow label="Weight (kg)">
                <input
                  name="weight_kg"
                  type="number"
                  defaultValue={profile?.weight_kg ?? ""}
                  placeholder="—"
                  step="0.1"
                  className="form-input"
                />
              </FormRow>
              <FormRow label="Activity level">
                <select name="activity_level" className="form-input" defaultValue={profile?.activity_level ?? ""}>
                  <option value="">Select...</option>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="Primary goal">
                <select name="health_goal" className="form-input" defaultValue={profile?.health_goal ?? ""}>
                  <option value="">Select...</option>
                  {GOAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FormRow>
            </div>
          </section>

          {/* ── Daily Targets ─────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Daily Targets
              </h2>
              {aiMacros && (
                <p className="text-xs text-gray-400">
                  AI recommended: {aiMacros.calories} cal
                </p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              <FormRow label="Calories">
                <div className="flex items-center gap-2">
                  <input
                    name="calorie_goal"
                    type="number"
                    defaultValue={profile?.calorie_goal ?? ""}
                    placeholder={aiMacros?.calories?.toString() ?? "—"}
                    className="form-input"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">cal</span>
                </div>
              </FormRow>
              <FormRow label="Protein">
                <div className="flex items-center gap-2">
                  <input
                    name="protein_goal_g"
                    type="number"
                    defaultValue={profile?.protein_goal_g ?? ""}
                    placeholder={aiMacros?.protein_g?.toString() ?? "—"}
                    className="form-input"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">g</span>
                </div>
              </FormRow>
              <FormRow label="Carbs">
                <div className="flex items-center gap-2">
                  <input
                    name="carbs_goal_g"
                    type="number"
                    defaultValue={profile?.carbs_goal_g ?? ""}
                    placeholder={aiMacros?.carbs_g?.toString() ?? "—"}
                    className="form-input"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">g</span>
                </div>
              </FormRow>
              <FormRow label="Fat">
                <div className="flex items-center gap-2">
                  <input
                    name="fat_goal_g"
                    type="number"
                    defaultValue={profile?.fat_goal_g ?? ""}
                    placeholder={aiMacros?.fat_g?.toString() ?? "—"}
                    className="form-input"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">g</span>
                </div>
              </FormRow>
            </div>
            {aiMacros && (
              <p className="text-xs text-gray-400 mt-2 px-1">
                AI recommended: {aiMacros.protein_g}g protein · {aiMacros.carbs_g}g carbs · {aiMacros.fat_g}g fat. Edit above to customize.
              </p>
            )}
          </section>

          {/* ── Dietary Notes ─────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Dietary Notes
            </h2>
            <textarea
              name="dietary_notes"
              defaultValue={profile?.dietary_notes ?? ""}
              placeholder="Allergies, intolerances, dietary preferences..."
              rows={3}
              className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </section>

          {/* ── Settings ──────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Settings
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              <FormRow label="Timezone">
                <div className="flex items-center gap-2 justify-end">
                  <input
                    name="timezone"
                    type="text"
                      defaultValue={profile?.timezone ?? detectedTz}
                    placeholder={detectedTz || "America/Chicago"}
                    className="form-input text-right w-44"
                  />
                </div>
              </FormRow>
              <FormRow label="Data retention">
                <select
                  name="data_retention_days"
                  className="form-input"
                  defaultValue={profile?.data_retention_days?.toString() ?? "90"}
                >
                  {RETENTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FormRow>
            </div>
            {detectedTz && (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (!profile?.timezone || profile?.timezone === "UTC") && (
                <p className="text-xs text-amber-600 mt-2 px-1">
                  ⚠ Your timezone isn&apos;t set yet. We detected <strong>{detectedTz}</strong> — save your profile to confirm it.
                </p>
              )
            )}
          </section>

          {/* ── Quick Log Buttons ──────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Quick Log Buttons
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              One-tap buttons in the chat bar. Tap a button to send its message to your AI assistant.
            </p>
            <QuickLogButtonsEditor
              initialButtons={profile?.quick_log_buttons as QuickLogButton[] | null}
            />
          </section>

          {/* Save */}
          <button
            type="submit"
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-2xl transition-colors text-sm"
          >
            Save changes
          </button>
        </form>

        {/* Data export */}
        <div className="mt-4">
          <a
            href="/api/export"
            download
            className="w-full py-3 flex items-center justify-center gap-2 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 font-medium text-sm rounded-2xl transition-colors"
          >
            <span>⬇</span>
            Export my data (CSV)
          </a>
        </div>

        {/* Sign out */}
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="w-full py-3 text-gray-400 hover:text-red-500 font-medium text-sm transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Quick Log Buttons editor ──────────────────────────────────────────────────

const EMOJI_SUGGESTIONS = ["💧","☕","🍵","🥛","🍌","🥗","🍎","🥚","🍞","🏃","💊","😴","🧃","🍷","🍺"];

function QuickLogButtonsEditor({ initialButtons }: { initialButtons: QuickLogButton[] | null }) {
  // Seed with defaults if the profile has no buttons saved yet
  const [buttons, setButtons] = useState<QuickLogButton[]>(
    initialButtons && initialButtons.length > 0 ? initialButtons : DEFAULT_QUICK_LOG_BUTTONS
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickLogButton | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newBtn, setNewBtn] = useState<Omit<QuickLogButton, "id" | "enabled">>({ emoji: "", label: "", message: "" });

  function startEdit(btn: QuickLogButton) {
    setEditingId(btn.id);
    setDraft({ ...btn });
    setIsAdding(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!draft) return;
    setButtons(prev => prev.map(b => b.id === draft.id ? draft : b));
    setEditingId(null);
    setDraft(null);
  }

  function deleteBtn(id: string) {
    setButtons(prev => prev.filter(b => b.id !== id));
    if (editingId === id) { setEditingId(null); setDraft(null); }
  }

  function toggleEnabled(id: string) {
    setButtons(prev => prev.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b));
  }

  function confirmAdd() {
    if (!newBtn.label.trim() || !newBtn.message.trim()) return;
    const btn: QuickLogButton = {
      id: crypto.randomUUID(),
      emoji: newBtn.emoji || "⚡",
      label: newBtn.label.trim(),
      message: newBtn.message.trim(),
      enabled: true,
    };
    setButtons(prev => [...prev, btn]);
    setNewBtn({ emoji: "", label: "", message: "" });
    setIsAdding(false);
  }

  return (
    <div className="space-y-2">
      {/* Hidden input carries the full JSON to the server action */}
      <input type="hidden" name="quick_log_buttons" value={JSON.stringify(buttons)} />

      {buttons.length === 0 && !isAdding && (
        <p className="text-xs text-gray-400 px-1">No buttons yet. Add one below.</p>
      )}

      {buttons.map(btn => (
        <div key={btn.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {editingId === btn.id && draft ? (
            /* ── Edit mode ── */
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <div className="w-20">
                  <label className="text-xs text-gray-400 mb-1 block">Emoji</label>
                  <input
                    type="text"
                    value={draft.emoji}
                    onChange={e => setDraft(d => d ? { ...d, emoji: e.target.value } : d)}
                    maxLength={2}
                    placeholder="💧"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-brand-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Label</label>
                  <input
                    type="text"
                    value={draft.label}
                    onChange={e => setDraft(d => d ? { ...d, label: e.target.value } : d)}
                    maxLength={20}
                    placeholder="Water"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Message sent to AI</label>
                <textarea
                  value={draft.message}
                  onChange={e => setDraft(d => d ? { ...d, message: e.target.value } : d)}
                  rows={2}
                  placeholder="Log a glass of water (250 ml)"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400 resize-none"
                />
              </div>
              {/* Emoji suggestions */}
              <div className="flex flex-wrap gap-1">
                {EMOJI_SUGGESTIONS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setDraft(d => d ? { ...d, emoji: e } : d)}
                    className="text-lg leading-none p-1 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!draft.label.trim() || !draft.message.trim()}
                  className="flex-1 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── Display mode ── */
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl leading-none">{btn.emoji || "⚡"}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${btn.enabled ? "text-gray-900" : "text-gray-400"}`}>
                  {btn.label}
                </p>
                <p className="text-xs text-gray-400 truncate">{btn.message}</p>
              </div>
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleEnabled(btn.id)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  btn.enabled ? "bg-brand-500" : "bg-gray-200"
                }`}
                title={btn.enabled ? "Shown in chat bar" : "Hidden from chat bar"}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    btn.enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              {/* Edit */}
              <button
                type="button"
                onClick={() => startEdit(btn)}
                className="text-gray-400 hover:text-gray-600 p-1 transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteBtn(btn.id)}
                className="text-gray-300 hover:text-red-400 p-1 transition-colors"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── Add new button form ── */}
      {isAdding ? (
        <div className="bg-white rounded-2xl border border-brand-100 p-4 space-y-3">
          <div className="flex gap-2">
            <div className="w-20">
              <label className="text-xs text-gray-400 mb-1 block">Emoji</label>
              <input
                type="text"
                value={newBtn.emoji}
                onChange={e => setNewBtn(n => ({ ...n, emoji: e.target.value }))}
                maxLength={2}
                placeholder="💧"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Label</label>
              <input
                type="text"
                value={newBtn.label}
                onChange={e => setNewBtn(n => ({ ...n, label: e.target.value }))}
                maxLength={20}
                placeholder="My coffee"
                autoFocus
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Message sent to AI</label>
            <textarea
              value={newBtn.message}
              onChange={e => setNewBtn(n => ({ ...n, message: e.target.value }))}
              rows={2}
              placeholder="Log a large oat milk latte"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400 resize-none"
            />
          </div>
          {/* Emoji suggestions */}
          <div className="flex flex-wrap gap-1">
            {EMOJI_SUGGESTIONS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setNewBtn(n => ({ ...n, emoji: e }))}
                className="text-lg leading-none p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAdd}
              disabled={!newBtn.label.trim() || !newBtn.message.trim()}
              className="flex-1 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setNewBtn({ emoji: "", label: "", message: "" }); }}
              className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setIsAdding(true); setEditingId(null); setDraft(null); }}
          className="w-full py-2.5 border border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
        >
          + Add button
        </button>
      )}
    </div>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <label className="text-sm text-gray-600 flex-shrink-0 w-32">{label}</label>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}
