-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Saved Meals + Plan Items
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum for meal slots ───────────────────────────────────────────────────────
create type meal_slot as enum (
  'breakfast', 'lunch', 'dinner', 'snack', 'workout'
);

-- ── saved_meals ───────────────────────────────────────────────────────────────
-- User-owned library of named meal templates built from logged food/drink entries.

create table saved_meals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  name            text not null,
  emoji           text not null default '🍽️',

  -- JSONB array of { entry_type: 'food'|'drink', structured_data: FoodData }
  -- Same field names as log_entries.structured_data for each food/drink item.
  items           jsonb not null default '[]',

  -- Denormalized totals — computed server-side on write, never trusted from client.
  total_calories  numeric(8,1) not null default 0,
  total_protein_g numeric(7,1) not null default 0,
  total_carbs_g   numeric(7,1) not null default 0,
  total_fat_g     numeric(7,1) not null default 0,

  -- Optional hint used to pre-select the slot when adding this meal to the planner.
  meal_type_hint  meal_slot
);

create index saved_meals_user_id_idx on saved_meals (user_id);

alter table saved_meals enable row level security;

create policy "Users can view own saved_meals"
  on saved_meals for select using (auth.uid() = user_id);
create policy "Users can insert own saved_meals"
  on saved_meals for insert with check (auth.uid() = user_id);
create policy "Users can update own saved_meals"
  on saved_meals for update using (auth.uid() = user_id);
create policy "Users can delete own saved_meals"
  on saved_meals for delete using (auth.uid() = user_id);

comment on table saved_meals is
  'Named meal templates that users build from logged food/drink entries.';
comment on column saved_meals.items is
  'Array of { entry_type: "food"|"drink", structured_data: FoodData } — mirrors log_entries shape.';
comment on column saved_meals.total_calories is
  'Denormalized sum of items[].structured_data.calories. Recomputed on every write.';

-- ── plan_items ────────────────────────────────────────────────────────────────
-- One row per planned slot per day. The client computes plan_date in the user's
-- local timezone to avoid UTC midnight boundary bugs.

create table plan_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  plan_date       date not null,
  meal_slot       meal_slot not null,

  -- When set, links to a saved meal (carries emoji + macro data via join).
  -- on delete set null: deleting a saved_meal orphans plan items gracefully —
  -- they retain their title and become plain-text items.
  saved_meal_id   uuid references saved_meals(id) on delete set null,

  -- Display name — required. Populated from saved_meal.name or free text.
  title           text not null,

  -- Optional detail for custom or AI-suggested items.
  description     text,

  is_done         boolean not null default false,
  done_at         timestamptz,

  -- Ordering within a (user, plan_date, meal_slot) group.
  display_order   integer not null default 0
);

create index plan_items_user_date_idx on plan_items (user_id, plan_date);
create index plan_items_saved_meal_idx on plan_items (user_id, saved_meal_id)
  where saved_meal_id is not null;

alter table plan_items enable row level security;

create policy "Users can view own plan_items"
  on plan_items for select using (auth.uid() = user_id);
create policy "Users can insert own plan_items"
  on plan_items for insert with check (auth.uid() = user_id);
create policy "Users can update own plan_items"
  on plan_items for update using (auth.uid() = user_id);
create policy "Users can delete own plan_items"
  on plan_items for delete using (auth.uid() = user_id);

comment on table plan_items is
  'One row per planned meal/workout slot per day. Rolling 7-day window read by the client.';
comment on column plan_items.plan_date is
  'Local calendar date in the user''s timezone. Stored as date (no time component).';

-- ── updated_at auto-maintenance ───────────────────────────────────────────────
-- The set_updated_at() function already exists from migration 001 but under a
-- different name (update_updated_at). Create the canonical name here so both
-- tables use a consistent trigger function name going forward.

create or replace function set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger saved_meals_updated_at
  before update on saved_meals
  for each row execute procedure set_updated_at();

create trigger plan_items_updated_at
  before update on plan_items
  for each row execute procedure set_updated_at();
