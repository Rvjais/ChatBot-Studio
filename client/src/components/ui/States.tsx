import type { ReactNode } from 'react';
import { CircleExclamationPoint, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '../../utils/cn';
import { getErrorMessage, getErrorStatus } from '../../utils/errors';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const status = getErrorStatus(error);
  const offline = status === undefined || status === 0;
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)} role="alert">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
        {offline ? <WifiOff size={22} /> : <CircleExclamationPoint size={22} />}
      </div>
      <h3 className="text-sm font-semibold text-zinc-900">{title ?? (status === 404 ? 'Not found' : 'Could not load this data')}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" icon={<RefreshCw size={15} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Inline callout for notes, warnings and errors inside forms/cards. */
export function Callout({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200/70',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200/70',
    error: 'bg-red-50 text-red-900 ring-red-200/70',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200/70',
    neutral: 'bg-zinc-50 text-zinc-700 ring-zinc-200',
  };
  return (
    <div className={cn('flex gap-3 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset', tones[tone], className)} role={tone === 'error' ? 'alert' : undefined}>
      {icon && <span className="mt-0.5 shrink-0 opacity-80">{icon}</span>}
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
