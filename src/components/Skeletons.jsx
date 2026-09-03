/** Пока грузится — скелеты, не спиннер: список не должен схлопываться. */
export function CardSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="skeleton size-[86px] shrink-0 rounded-[8px]" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton h-3 w-44 rounded" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 6 }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-card">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={index > 0 ? 'border-t border-separator' : ''}>
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}
