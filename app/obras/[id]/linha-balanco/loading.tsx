export default function Loading() {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 bg-gray-200 rounded w-56" />
        <div className="flex gap-2">
          <div className="h-9 bg-gray-200 rounded w-24" />
          <div className="h-9 bg-gray-200 rounded w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded w-20" />
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-12 bg-gray-200 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex border-t border-gray-100">
            <div className="w-40 h-12 bg-gray-100 border-r border-gray-100 shrink-0" />
            <div className="flex-1 h-12 relative">
              <div
                className="absolute top-2 h-8 bg-gray-200 rounded"
                style={{ left: `${10 + (i * 13) % 40}%`, width: `${20 + (i * 7) % 30}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
