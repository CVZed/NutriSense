-- ─────────────────────────────────────────────────────────────────────────────
-- NutriSense — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Custom types ─────────────────────────────────────────────────────────────

create type entry_type as enum (
  'food', 'drink', 'exercise', 'sleep', 'symptom', 'mood', 'note'
);

create type ai_confidence as enum ('low', 'medium', 'high');

create type data_source as enum ('text', 'photo_panel', 'ai_estimate');

create type health_goal as enum (
  'weight_loss', 'maintenance', 'muscle_gain', 'general_wellness', 'symptom_tracking'
);

create type activity_level as enum (
  'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'
);

create type biological_sex as enum ('male', 'female', 'prefer_not_to_say');

create type insight_type as enum (
  'nutrition', 'sleep', 'activity', 'symptom', 'correlation', 'satiety', 'deficit'
);

create type insight_confidence as enum ('low', 'medium', 'high');

create type message_role as enum ('user', 'assistant');

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- One row per user. Created automatically on signup via trigger below.

create table profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  name                      text,
  age                       smallint check (age > 0 and age < 130),
  biological_sex            biological_sex,
  height_cm                 numeric(5,1) check (height_cm > 0),
  weight_kg                 numeric(5,1) check (weight_kg > 0),
  activity_level            activity_level,
  health_goal               health_goal,
  -- User-set targets (may differ from AI recommendations)
  calorie_goal              integer check (calorie_goal > 0),
  protein_goal_g            integer check (protein_goal_g >= 0),
  carbs_goal_g              integer check (carbs_goal_g >= 0),
  fat_goal_g                integer check (fat_goal_g >= 0),
  -- AI-generated recommendations (stored separately so user edits don't overwrite them)
  ai_recommended_calories   integer,
  ai_recommended_macros     jsonb,
  dietary_notes             text,
  data_retention_days       integer not null default 90 check (data_retention_days in (30, 90, 180, 36500)),
  onboarding_complete       boolean not null default false
);

-- Auto-create profile row when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Auto-update updated_at on any profile change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

-- ─── verified_foods ───────────────────────────────────────────────────────────
-- Shared database of foods parsed from nutrition facts panels.

create table verified_foods (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  submitted_by_user_id  uuid references profiles(id) on delete set null,
  product_name          text not null,
  brand                 text,
  barcode               text,
  serving_size          numeric(8,2) not null check (serving_size > 0),
  serving_unit          text not null,
  calories              integer not null check (calories >= 0),
  protein_g             numeric(6,2) not null check (protein_g >= 0),
  carbs_g               numeric(6,2) not null check (carbs_g >= 0),
  fat_g                 numeric(6,2) not null check (fat_g >= 0),
  fiber_g               numeric(6,2) check (fiber_g >= 0),
  sodium_mg             integer check (sodium_mg >= 0),
  sugar_g               numeric(6,2) check (sugar_g >= 0),
  scan_count            integer not null default 1 check (scan_count > 0)
);

create index verified_foods_product_name_idx on verified_foods using gin (to_tsvector('english', product_name));
create index verified_foods_barcode_idx on verified_foods (barcode) where barcode is not null;

-- ─── log_entries ─────────────────────────────────────────────────────────────
-- Every food, exercise, sleep, symptom, and mood event.

create table log_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  -- logged_at is when the event actually happened (may differ from created_at for batch logging)
  logged_at         timestamptz not null default now(),
  entry_type        entry_type not null,
  raw_text          text,
  raw_image_url     text,
  structured_data   jsonb not null default '{}',
  ai_confidence     ai_confidence not null default 'medium',
  data_source       data_source not null default 'text',
  is_edited         boolean not null default false,
  verified_food_id  uuid references verified_foods(id) on delete set null
);

-- Most common query: user's entries in a rolling time window
create index log_entries_user_logged_at_idx on log_entries (user_id, logged_at desc);
create index log_entries_user_type_idx on log_entries (user_id, entry_type, logged_at desc);

-- ─── conversation_messages ────────────────────────────────────────────────────
-- Full chat history. Injected as context when the AI resumes a session.

create table conversation_messages (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  session_id        uuid not null,
  created_at        timestamptz not null default now(),
  role              message_role not null,
  content           text not null,
  image_url         text,
  -- Which log_entries were created from this message (for traceability)
  linked_entry_ids  uuid[] not null default '{}'
);

create index conversation_messages_user_created_at_idx on conversation_messages (user_id, created_at desc);
create index conversation_messages_session_idx on conversation_messages (session_id, created_at asc);

-- ─── insights ─────────────────────────────────────────────────────────────────
-- Generated insights stored for history and comparison.

create table insights (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,
  generated_at        timestamptz not null default now(),
  insight_type        insight_type not null,
  title               text not null,
  body                text not null,
  confidence_level    insight_confidence not null,
  data_window_start   date not null,
  data_window_end     date not null
);

create index insights_user_generated_at_idx on insights (user_id, generated_at desc);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Users can only read and write their own data.

alter table profiles enable row level security;
alter table log_entries enable row level security;
alter table conversation_messages enable row level security;
alter table insights enable row level security;
alter table verified_foods enable row level security;

-- profiles
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- log_entries
create policy "Users can view own entries"
  on log_entries for select using (auth.uid() = user_id);
create policy "Users can insert own entries"
  on log_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own entries"
  on log_entries for update using (auth.uid() = user_id);
create policy "Users can delete own entries"
  on log_entries for delete using (auth.uid() = user_id);

-- conversation_messages
create policy "Users can view own messages"
  on conversation_messages for select using (auth.uid() = user_id);
create policy "Users can insert own messages"
  on conversation_messages for insert with check (auth.uid() = user_id);

-- insights
create policy "Users can view own insights"
  on insights for select using (auth.uid() = user_id);
create policy "Users can insert own insights"
  on insights for insert with check (auth.uid() = user_id);

-- verified_foods: readable by all authenticated users, insertable by any authenticated user
create policy "Authenticated users can view verified foods"
  on verified_foods for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert verified foods"
  on verified_foods for insert with check (auth.role() = 'authenticated');
create policy "Submitter can update their verified foods"
  on verified_foods for update using (auth.uid() = submitted_by_user_id);

-- ─── Data retention cleanup function ─────────────────────────────────────────
-- Call this on a schedule (e.g. daily via pg_cron or a Supabase Edge Function cron)

create or replace function purge_expired_entries()
returns void as $$
begin
  delete from log_entries le
  using profiles p
  where le.user_id = p.id
    and p.data_retention_days < 36500  -- 36500 = "unlimited"
    and le.logged_at < now() - (p.data_retention_days || ' days')::interval;

  delete from conversation_messages cm
  using profiles p
  where cm.user_id = p.id
    and p.data_retention_days < 36500
    and cm.created_at < now() - (p.data_retention_days || ' days')::interval;
end;
$$ language plpgsql security definer;
