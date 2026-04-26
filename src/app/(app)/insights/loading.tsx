// Shown by Next.js App Router while insights/page.tsx data is loading

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-100 rounded-xl ${className ?? ""}`} />
  );
}

export default function InsightsLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 pt-safe flex-shrink-0">
        <Skeleton className="h-4 w-20 mb-1" />
        <Skeleton className="h-3 w-40" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 border border-gray-100 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>

        {/* Calorie bar chart */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <Skeleton className="h-4 w-28 mb-1" />
          <Skeleton className="h-3 w-40 mb-3" />
          <Skeleton className="h-28 w-full" />
          <div className="flex gap-1 mt-2">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="flex-1 h-3" />
            ))}
          </div>
        </div>

        {/* Macros card */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>

        {/* AI Analysis card */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex gap-1">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-7 w-8 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="px-4 py-4 space-y-2 min-h-[120px] flex items-start gap-2">
            <div className="flex gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-gray-400">Analyzing your data…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
