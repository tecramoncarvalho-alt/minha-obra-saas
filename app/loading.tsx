export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-7xl mx-auto space-y-6">
      <div className="h-8 bg-gray-200 rounded w-40" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
            <div className="h-3 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
