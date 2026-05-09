# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # local dev server (localhost:3000)
npm run build        # production build — run this before committing to catch type errors
npm run lint         # ESLint
npm run type-check   # tsc --noEmit without building
```

There are no tests. Always run `npm run build` to validate changes.

## Architecture overview

NutriSense is a Next.js 14 App Router PWA deployed on Vercel. Auth and database are Supabase. AI is Claude via the Vercel AI SDK.

### Route groups

- `src/app/(app)/` — authenticated pages: `chat`, `timeline`, `insights`, `plan`, `profile`. Middleware redirects unauthenticated users to `/auth/login`.
- `src/app/auth/` — login/signup pages, OAuth callback.
- `src/app/api/` — server-side API routes. Auth middleware does NOT protect these — each route calls `supabase.auth.getUser()` itself.

### Two Supabase clients (important)

Every API route creates **two** clients:

1. **Anon client** (`createClient()` from `src/lib/supabase/server.ts`) — uses the anon key, respects RLS. Used only for auth (`getUser()`) and reads where RLS is acceptable.
2. **Admin client** (inline `createSupabaseClient(url, SERVICE_ROLE_KEY)`) — bypasses RLS. Used for all server-side writes (log entries, profile updates, conversation messages, saved meals, plan items). Created per-request, not as a singleton.

### AI stack — critical version constraint

The app uses two separate Anthropic packages:

- **`@ai-sdk/anthropic@1.2.12` + `ai@4.3.19`** — Vercel AI SDK. Used in all AI API routes for `streamText`, `generateObject`, `createDataStreamResponse`.
- **`@anthropic-ai/sdk`** — raw Anthropic SDK. Imported only via `src/lib/anthropic/client.ts` (not currently used by the main routes).

**Do not upgrade `@ai-sdk/anthropic` above `1.2.12` without also upgrading `ai`.** Both packages must share the same `@ai-sdk/provider` interface version. v1.2.12 and `ai@4.3.19` both use `@ai-sdk/provider@1.1.3`. v2+ of the adapter uses a different interface — the `as any` type cast hides the error at compile time but the app breaks at runtime.

Model names (`claude-sonnet-4-5`, `claude-haiku-4-5`) are passed as `anthropic("model-name" as string)` because v1.2.12 types don't include the newer model name strings. The Anthropic API accepts them regardless.

### AI API routes

| Route | Model | Purpose |
|---|---|---|
| `/api/chat` | claude-sonnet-4-5 | Main logging chat. Streaming. Two modes: onboarding (`complete_onboarding` tool) and regular (`search_food` + `create_log_entry` tools). Max 4 tool steps. |
| `/api/insights-chat` | claude-sonnet-4-5 | Insights Q&A. Streaming. No tools — reads 7–90 days of log entries. |
| `/api/quick-trend` | claude-haiku-4-5 | Returns `{ found, trend, confidence }`. Non-streaming `generateObject`. |
| `/api/plan-suggest` | claude-haiku-4-5 | Returns `{ title, description }` for a meal slot/day. Non-streaming `generateObject`. Receives slot, date, and user profile context. |

### System prompts

`src/lib/prompts/chat.ts` — `buildChatSystemPrompt()` is called on every `/api/chat` request. It injects the user's profile, goals, and today's full log. Switches between onboarding and regular mode via `profile.onboarding_complete`.

`src/lib/prompts/onboarding.ts` — static string, used when `!profile.onboarding_complete`.

### Data model

All health events go in `log_entries`. The `entry_type` enum (`food`, `drink`, `exercise`, `sleep`, `symptom`, `mood`, `note`) determines the shape of the `structured_data` JSONB column — there is no separate table per type.

`saved_meals` — user-owned library of named meal templates. `items` is a JSONB array of `SavedMealItem[]` (same shape as food/drink `structured_data`). Macro totals (`total_calories`, etc.) are denormalized and always computed server-side on write — never trusted from client.

`plan_items` — kanban-style planning rows. `plan_date` is stored as a `date` type (no time component) to avoid UTC midnight boundary bugs. `saved_meal_id` uses `ON DELETE SET NULL` so deleting a saved meal orphans plan items gracefully while preserving their `title`.

`profiles.quick_log_buttons` is a JSONB array of `{ id, emoji, label, message, enabled }`. An empty array means "use app defaults" — never null. Use `PATCH /api/profile/quick-log` to append one button without a full profile form re-submit (capped at 12).

All timestamps in the database are UTC (`timestamptz`). The user's timezone is stored in `profiles.timezone` and used throughout to compute local-day boundaries.

### Chat pre-fill pattern

Navigating to `/chat?prompt=some+text` shows a dismissable **"Ready to log"** chip above the input bar. The user must tap **Send** to confirm or **×** to dismiss — the text is never silently inserted into the input field. This prevents accidental double-logging when the user just wants to type something else. The URL param is cleared via `window.history.replaceState` on mount. Implemented in `ChatInterface.tsx` via `pendingPrompt` state.

### Serving size multiplier (LogEntryCard)

Food/drink cards in view mode show `0.5×` `1×` `1.5×` `2×` `3×` buttons. Tapping one immediately scales all macros and quantity from a stored `baseServingData` ref (initialized as current values ÷ existing `servings_count`) and PATCHes the entry. Manual edits via the edit form reset `baseServingData` to the newly saved values and reset the active multiplier to `1×`.

### Food data sources (in priority order)

1. **Barcode scan** → `GET /api/barcode?upc=…` → Open Food Facts API
2. **Natural language / photo** → `search_food` tool in `/api/chat` → USDA FoodData Central API (`src/lib/usda.ts`). Returns per-100g values; the AI scales to portion size.
3. **Nutrition label photo** → AI reads values directly from the label, skips USDA lookup.

### PWA

`public/sw.js` is a vanilla service worker that caches static assets. It only intercepts GET requests — POST requests to API routes always go to the network.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only, used for admin client
ANTHROPIC_API_KEY
USDA_API_KEY                   # optional — DEMO_KEY works for low volume
NEXT_PUBLIC_APP_URL            # http://localhost:3000 in dev
```

## Database migrations

Migrations live in `supabase/migrations/` as plain SQL files. There is no CLI migration runner configured — apply them manually in the Supabase Dashboard SQL editor. `src/types/database.ts` is the TypeScript type mirror of the schema; update it manually when the schema changes.

Current migrations:
- `001_initial_schema.sql` — core tables: `profiles`, `log_entries`, `conversation_messages`
- `002_...` — (if present) incremental additions
- `003_saved_meals_and_planning.sql` — `meal_slot` enum, `saved_meals`, `plan_items` tables with RLS and `updated_at` triggers
