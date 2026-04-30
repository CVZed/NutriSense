"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, CalendarDays, Lightbulb, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
  },
  {
    href: "/timeline",
    label: "Today",
    icon: CalendarDays,
  },
  {
    href: "/insights",
    label: "Insights",
    icon: Lightbulb,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: User,
  },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-shrink-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                isActive
                  ? "text-brand-600"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  isActive ? "text-brand-600" : "text-gray-400"
                )}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
