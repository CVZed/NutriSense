-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Quick Log Buttons
-- Adds a JSONB column to profiles for user-configured one-tap log buttons.
-- ─────────────────────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists quick_log_buttons jsonb not null default '[]';

comment on column profiles.quick_log_buttons is
  'Array of QuickLogButton objects: { id, emoji, label, message, enabled }. '
  'Empty array means "use app defaults" so the column is never null.';
