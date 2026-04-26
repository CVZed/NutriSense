// Shown by Next.js App Router while timeline/page.tsx data is loading

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-100 rounded-xl ${className ?? ""}`} />
  );
}

export default function TimelineLoading() {
  return (
    <div className="h-[calc(100dvh-64px)] flex justify-center bg-gray-50">
      <div className="w-full md:max-w-2xl bg-gray-50 h-full flex flex-col">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
          <Skeleton className="h-3 w-28 mb-1.5" />
          <Skeleton className="h-4 w-44" />
        </div>

        <div className="flex-1 overflow-hidden px-4 pt-4 space-y-3">

          {/* Nutrition summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <Skeleton className="h-3 w-24 mb-3" />
            <div className="flex items-center gap-4">
              {/* Ring placeholder */}
              <div className="w-[124px] h-[124px] rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>

          {/* Chart card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 pt-3 pb-2">
            <Skeleton className="h-3 w-32 mb-3" />
            <Skeleton className="h-[230px] w-full rounded-lg" />
            <div className="flex justify-center gap-5 pt-2 pb-1">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-9 rounded-full" />
              ))}
            </div>
          </div>

          {/* Entry list skeletons */}
          <div className="space-y-2 pb-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
