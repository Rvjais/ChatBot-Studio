import { LoaderCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('animate-spin text-current', className)} aria-hidden="true" />;
}

export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-zinc-500" role="status">
      <Spinner size={22} className="text-brand-600" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-zinc-200/70', className)} aria-hidden="true" />;
}

/** Generic table/list placeholder. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="hidden h-6 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
