"use client";

import { useEffect, useRef } from "react";
import PlanDayColumn from "./PlanDayColumn";
import type { PlanItem, SavedMeal } from "@/types/database";

interface WeekViewProps {
  planItems: PlanItem[];
  savedMeals: SavedMeal[];
  fromDate: string; // YYYY-MM-DD, yesterday
  toDate: string;   // YYYY-MM-DD, +5 days
  todayDate: string;
  onRefresh: () => void;
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function WeekView({
  planItems,
  savedMeals,
  fromDate,
  toDate,
  todayDate,
  onRefresh,
}: WeekViewProps) {
  const dates = getDatesInRange(fromDate, toDate);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  // Scroll today's column into view on mount
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const col = todayRef.current;
      const colLeft = col.offsetLeft;
      const colWidth = col.offsetWidth;
      const containerWidth = container.offsetWidth;
      // Center the today column
      container.scrollLeft = colLeft - (containerWidth - colWidth) / 2;
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-x-auto overflow-y-hidden"
      style={{ scrollSnapType: "x mandatory" }}
    >
      <div className="flex h-full" style={{ minWidth: `${dates.length * 180}px` }}>
        {dates.map(date => (
          <div
            key={date}
            ref={date === todayDate ? todayRef : undefined}
            className="flex-shrink-0 h-full border-r border-gray-100 last:border-r-0"
            style={{ width: 180, scrollSnapAlign: "start" }}
          >
            <PlanDayColumn
              date={date}
              isToday={date === todayDate}
              items={planItems.filter(item => item.plan_date === date)}
              savedMeals={savedMeals}
              onRefresh={onRefresh}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
