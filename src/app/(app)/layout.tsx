import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Page content — grows to fill available space above nav */}
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

      {/* Bottom navigation — in-flow so main never goes behind it */}
      <BottomNav />
    </div>
  );
}
