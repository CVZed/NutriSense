// Auto-kept in sync with supabase/migrations/001_initial_schema.sql
// Run `npx supabase gen types typescript` to regenerate from a live project

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Quick Log Buttons ────────────────────────────────────────────────────────

export interface QuickLogButton {
  id: string;       // stable key (uuid or slug)
  emoji: string;
  label: string;
  message: string;  // sent verbatim to Claude when tapped
  enabled: boolean; // false = hidden from chat bar but preserved in profile
}

export const DEFAULT_QUICK_LOG_BUTTONS: QuickLogButton[] = [
  { id: "water",  emoji: "💧", label: "Water",  message: "Log a glass of water (250 ml)",   enabled: true },
  { id: "coffee", emoji: "☕", label: "Coffee", message: "Log a coffee (250 ml, black)",     enabled: true },
  { id: "tea",    emoji: "🍵", label: "Tea",    message: "Log a cup of tea (250 ml)",        enabled: true },
];

// ─── Entry type enums ─────────────────────────────────────────────────────────

export type EntryType =
  | "food"
  | "drink"
  | "exercise"
  | "sleep"
  | "symptom"
  | "mood"
  | "note";

export type AIConfidence = "low" | "medium" | "high";

export type DataSource = "text" | "photo_panel" | "ai_estimate";

export type HealthGoal =
  | "weight_loss"
  | "maintenance"
  | "muscle_gain"
  | "general_wellness"
  | "symptom_tracking";

export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extra_active";

export type BiologicalSex = "male" | "female" | "prefer_not_to_say";

export type InsightType =
  | "nutrition"
  | "sleep"
  | "activity"
  | "symptom"
  | "correlation"
  | "satiety"
  | "deficit";

export type InsightConfidence = "low" | "medium" | "high";

export type MessageRole = "user" | "assistant";

// ─── Structured data shapes per entry type ───────────────────────────────────

export interface FoodData {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sodium_mg?: number;
  sugar_g?: number;
  servings_count: number;
  usda_fdc_id?: number;
}

export interface ExerciseData {
  activity_type: string;
  duration_min: number;
  intensity: "low" | "moderate" | "high";
  calories_burned_est: number;
  notes?: string;
}

export interface SleepData {
  start_time: string; // ISO timestamp
  end_time: string; // ISO timestamp
  duration_min: number;
  quality_signal?: "poor" | "fair" | "good" | "great";
  notes?: string;
}

export interface SymptomData {
  symptom_name: string;
  severity: 1 | 2 | 3 | 4 | 5;
  body_area?: string;
  notes?: string;
}

export interface MoodData {
  mood_label: string;
  energy_level: 1 | 2 | 3 | 4 | 5;
  hunger_level?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

export interface NoteData {
  text: string;
}

export type StructuredData =
  | FoodData
  | ExerciseData
  | SleepData
  | SymptomData
  | MoodData
  | NoteData;

// ─── Database row types ───────────────────────────────────────────────────────
// Structure must match @supabase/supabase-js GenericSchema:
//   Tables → each needs Row, Insert, Update, Relationships
//   Views, Functions → required at schema level (empty maps here)

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; // references auth.users
          created_at: string;
          updated_at: string;
          name: string | null;
          age: number | null;
          biological_sex: BiologicalSex | null;
          height_cm: number | null;
          weight_kg: number | null;
          activity_level: ActivityLevel | null;
          health_goal: HealthGoal | null;
          calorie_goal: number | null;
          protein_goal_g: number | null;
          carbs_goal_g: number | null;
          fat_goal_g: number | null;
          ai_recommended_calories: number | null;
          ai_recommended_macros: Json | null;
          dietary_notes: string | null;
          data_retention_days: number;
          onboarding_complete: boolean;
          quick_log_buttons: Json; // QuickLogButton[]
          timezone: string | null;
        };
        Insert: {
          id: string;
          name?: string | null;
          age?: number | null;
          biological_sex?: BiologicalSex | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          activity_level?: ActivityLevel | null;
          health_goal?: HealthGoal | null;
          calorie_goal?: number | null;
          protein_goal_g?: number | null;
          carbs_goal_g?: number | null;
          fat_goal_g?: number | null;
          ai_recommended_calories?: number | null;
          ai_recommended_macros?: Json | null;
          dietary_notes?: string | null;
          data_retention_days?: number;
          onboarding_complete?: boolean;
          quick_log_buttons?: Json;
          timezone?: string | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          age?: number | null;
          biological_sex?: BiologicalSex | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          activity_level?: ActivityLevel | null;
          health_goal?: HealthGoal | null;
          calorie_goal?: number | null;
          protein_goal_g?: number | null;
          carbs_goal_g?: number | null;
          fat_goal_g?: number | null;
          ai_recommended_calories?: number | null;
          ai_recommended_macros?: Json | null;
          dietary_notes?: string | null;
          data_retention_days?: number;
          onboarding_complete?: boolean;
          quick_log_buttons?: Json;
          timezone?: string | null;
        };
        Relationships: [];
      };
      log_entries: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          logged_at: string;
          entry_type: EntryType;
          raw_text: string | null;
          raw_image_url: string | null;
          structured_data: Json;
          ai_confidence: AIConfidence;
          data_source: DataSource;
          is_edited: boolean;
          verified_food_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          logged_at?: string;
          entry_type: EntryType;
          raw_text?: string | null;
          raw_image_url?: string | null;
          structured_data?: Json;
          ai_confidence?: AIConfidence;
          data_source?: DataSource;
          is_edited?: boolean;
          verified_food_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          logged_at?: string;
          entry_type?: EntryType;
          raw_text?: string | null;
          raw_image_url?: string | null;
          structured_data?: Json;
          ai_confidence?: AIConfidence;
          data_source?: DataSource;
          is_edited?: boolean;
          verified_food_id?: string | null;
        };
        Relationships: [];
      };
      conversation_messages: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          created_at: string;
          role: MessageRole;
          content: string;
          image_url: string | null;
          linked_entry_ids: string[];
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          created_at?: string;
          role: MessageRole;
          content: string;
          image_url?: string | null;
          linked_entry_ids?: string[];
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          role?: MessageRole;
          content?: string;
          image_url?: string | null;
          linked_entry_ids?: string[];
        };
        Relationships: [];
      };
      insights: {
        Row: {
          id: string;
          user_id: string;
          generated_at: string;
          insight_type: InsightType;
          title: string;
          body: string;
          confidence_level: InsightConfidence;
          data_window_start: string;
          data_window_end: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          generated_at?: string;
          insight_type: InsightType;
          title: string;
          body: string;
          confidence_level: InsightConfidence;
          data_window_start: string;
          data_window_end: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          insight_type?: InsightType;
          title?: string;
          body?: string;
          confidence_level?: InsightConfidence;
          data_window_start?: string;
          data_window_end?: string;
        };
        Relationships: [];
      };
      verified_foods: {
        Row: {
          id: string;
          created_at: string;
          submitted_by_user_id: string | null;
          product_name: string;
          brand: string | null;
          barcode: string | null;
          serving_size: number;
          serving_unit: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number | null;
          sodium_mg: number | null;
          sugar_g: number | null;
          scan_count: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          submitted_by_user_id?: string | null;
          product_name: string;
          brand?: string | null;
          barcode?: string | null;
          serving_size: number;
          serving_unit: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g?: number | null;
          sodium_mg?: number | null;
          sugar_g?: number | null;
          scan_count?: number;
        };
        Update: {
          id?: string;
          submitted_by_user_id?: string | null;
          product_name?: string;
          brand?: string | null;
          barcode?: string | null;
          serving_size?: number;
          serving_unit?: string;
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fiber_g?: number | null;
          sodium_mg?: number | null;
          sugar_g?: number | null;
          scan_count?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
}
