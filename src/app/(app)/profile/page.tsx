import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles").select("*").eq("id", user.id).single() as { data: Profile | null };

  async function saveProfile(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("profiles")
      .update({
        name: (formData.get("name") as string) || null,
        age: formData.get("age") ? Number(formData.get("age")) : null,
        height_cm: formData.get("height_cm")
          ? Number(formData.get("height_cm"))
          : null,
        weight_kg: formData.get("weight_kg")
          ? Number(formData.get("weight_kg"))
          : null,
        activity_level:
          (formData.get("activity_level") as string) || null,
        health_goal: (formData.get("health_goal") as string) || null,
        calorie_goal: formData.get("calorie_goal")
          ? Number(formData.get("calorie_goal"))
          : null,
        protein_goal_g: formData.get("protein_goal_g")
          ? Number(formData.get("protein_goal_g"))
          : null,
        carbs_goal_g: formData.get("carbs_goal_g")
          ? Number(formData.get("carbs_goal_g"))
          : null,
        fat_goal_g: formData.get("fat_goal_g")
          ? Number(formData.get("fat_goal_g"))
          : null,
        dietary_notes: (formData.get("dietary_notes") as string) || null,
        data_retention_days: formData.get("data_retention_days")
          ? Number(formData.get("data_retention_days"))
          : 90,
        ...(formData.get("timezone") ? { timezone: formData.get("timezone") as string } : {}),
        ...(formData.get("quick_log_buttons") ? { quick_log_buttons: JSON.parse(formData.get("quick_log_buttons") as string) } : {}),
      })
      .eq("id", user.id);

    redirect("/profile?saved=true");
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/auth/login");
  }

  return <ProfileForm profile={profile} saveProfile={saveProfile} signOut={signOut} />;
}
