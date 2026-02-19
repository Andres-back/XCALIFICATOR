/**
 * Skeleton loader component for content placeholders during loading.
 * @param {object} props
 * @param {'card'|'list'|'stats'|'table'} [props.type='card'] - Skeleton type
 * @param {number} [props.count=3] - Number of skeleton items
 */
export default function SkeletonLoader({ type = 'card', count = 3 }) {
  const pulse = 'animate-pulse bg-gray-200 rounded';

  if (type === 'stats') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`${pulse} w-10 h-10 rounded-xl mb-3`} />
            <div className={`${pulse} h-7 w-16 mb-2`} />
            <div className={`${pulse} h-4 w-24`} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <div className={`${pulse} w-10 h-10 rounded-full shrink-0`} />
              <div className="flex-1 space-y-2">
                <div className={`${pulse} h-4 w-3/4`} />
                <div className={`${pulse} h-3 w-1/2`} />
              </div>
              <div className={`${pulse} h-8 w-20 rounded-lg`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className={`${pulse} h-5 w-48`} />
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-50 last:border-0">
            <div className={`${pulse} h-4 w-8`} />
            <div className={`${pulse} h-4 flex-1`} />
            <div className={`${pulse} h-4 w-20`} />
            <div className={`${pulse} h-4 w-16`} />
          </div>
        ))}
      </div>
    );
  }

  // Default: card grid
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`${pulse} w-10 h-10 rounded-xl shrink-0`} />
            <div className="flex-1">
              <div className={`${pulse} h-5 w-3/4 mb-2`} />
              <div className={`${pulse} h-3 w-1/2`} />
            </div>
          </div>
          <div className="space-y-2">
            <div className={`${pulse} h-3 w-full`} />
            <div className={`${pulse} h-3 w-5/6`} />
          </div>
          <div className="flex gap-2 mt-4">
            <div className={`${pulse} h-8 w-24 rounded-lg`} />
            <div className={`${pulse} h-8 w-24 rounded-lg`} />
          </div>
        </div>
      ))}
    </div>
  );
}
