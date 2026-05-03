export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-7xl mx-auto space-y-6">
      <div className="h-8 bg-gray-200 rounded w-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-40" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
}
