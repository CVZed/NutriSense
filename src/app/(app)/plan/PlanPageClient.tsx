"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import WeekView from "./WeekView";
import MealsView from "./MealsView";
import type { PlanItem, SavedMeal } from "@/types/database";

interface PlanPageClientProps {
  planItems: PlanItem[];
  savedMeals: SavedMeal[];
  fromDate: string;
  toDate: string;
  todayDate: string;
}

type Tab = "week" | "meals";

export default function PlanPageClient({
  planItems,
  savedMeals,
  fromDate,
  toDate,
  todayDate,
}: PlanPageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("week");

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="h-[calc(100dvh-64px)] flex justify-center bg-gray-50">
      <div className="w-full md:max-w-2xl md:shadow-xl md:border-x md:border-gray-200 bg-white h-full flex flex-col">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-0 flex-shrink-0">
          <p className="text-base font-semibold text-gray-900 mb-3">Plan</p>

          {/* Tab pills */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-0">
            {(["week", "meals"] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "week" ? "Week" : "Saved Meals"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "week" ? (
            <WeekView
              planItems={planItems}
              savedMeals={savedMeals}
              fromDate={fromDate}
              toDate={toDate}
              todayDate={todayDate}
              onRefresh={refresh}
            />
          ) : (
            <MealsView
              savedMeals={savedMeals}
              onRefresh={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
