import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'gray' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const dots: Record<BadgeTone, string> = {
  gray: 'bg-zinc-400',
  brand: 'bg-brand-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
};

export function Badge({
  tone = 'gray',
  dot,
  icon,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dots[tone])} aria-hidden="true" />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
