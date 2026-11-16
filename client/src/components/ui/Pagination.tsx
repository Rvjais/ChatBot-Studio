import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../utils/format';
import { cn } from '../../utils/cn';
import { Button } from './Button';

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  className,
  itemLabel = 'results',
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500', className)}>
      <p className="tabular">
        Showing <span className="font-medium text-zinc-800">{formatNumber(from)}</span>–
        <span className="font-medium text-zinc-800">{formatNumber(to)}</span> of{' '}
        <span className="font-medium text-zinc-800">{formatNumber(total)}</span> {itemLabel}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<ChevronLeft size={15} />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <span className="tabular px-1 text-xs">
            Page {page} of {pages}
          </span>
          <Button size="sm" iconRight={<ChevronRight size={15} />} disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
