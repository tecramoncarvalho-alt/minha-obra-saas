export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-4xl mx-auto space-y-6">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-32" />
        <div className="h-3 bg-gray-100 rounded-full w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="h-5 bg-gray-200 rounded w-48" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="h-3 bg-gray-100 rounded w-20" />
                <div className="h-9 bg-gray-200 rounded" />
              </div>
              <div className="space-y-1">
                <div className="h-3 bg-gray-100 rounded w-28" />
                <div className="h-9 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="h-9 bg-gray-300 rounded w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}
