import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../utils/cn';

export interface NavTab {
  to: string;
  label: string;
  icon?: ReactNode;
  end?: boolean;
}

/** Route-synced tab bar (each tab is a link). Scrolls horizontally on small screens. */
export function NavTabs({ tabs, className }: { tabs: NavTab[]; className?: string }) {
  return (
    <nav className={cn('scrollbar-thin -mb-px flex gap-1 overflow-x-auto', className)} aria-label="Sections">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800',
            )
          }
        >
          {t.icon}
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Compact local tabs / toggle group. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-lg bg-zinc-100 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
