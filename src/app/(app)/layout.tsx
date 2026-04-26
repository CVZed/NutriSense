import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* Page content — grows to fill space above nav */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Fixed bottom navigation */}
      <BottomNav />
    </div>
  );
}
