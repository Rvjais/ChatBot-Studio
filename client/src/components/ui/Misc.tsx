import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { controlBase, controlBorder, Field } from './Field';

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Native color picker + hex text input kept in sync. */
export function ColorInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = HEX_COLOR.test(text);
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : /^#[0-9a-fA-F]{3}$/.test(value) ? `#${value.slice(1).replace(/./g, (c) => c + c)}` : '#000000';
  return (
    <Field label={label} error={error ?? (!valid ? 'Use a hex color such as #4f46e5' : undefined)}>
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-zinc-300 shadow-xs" title="Pick a color">
          <span className="absolute inset-1 rounded-md" style={{ background: valid ? text : value }} />
          <input
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} picker`}
          />
        </label>
        <input
          className={cn(controlBase, controlBorder(!valid), 'h-9 px-3 font-mono uppercase')}
          value={text}
          maxLength={9}
          aria-label={`${label} hex value`}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (HEX_COLOR.test(v)) onChange(v);
          }}
        />
      </div>
    </Field>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(controlBase, controlBorder(), 'h-9 pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Hover/focus tooltip (CSS only). */
export function Tooltip({ content, children, className, side = 'top' }: { content: ReactNode; children: ReactNode; className?: string; side?: 'top' | 'bottom' }) {
  return (
    <span className={cn('group/tt relative inline-flex', className)} tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none invisible absolute left-1/2 z-30 w-max max-w-xs -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs leading-relaxed font-normal whitespace-normal text-white opacity-0 shadow-lg transition-opacity',
          'group-hover/tt:visible group-hover/tt:opacity-100 group-focus/tt:visible group-focus/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Stat tile: label · value · optional hint. Values use proportional figures. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white p-4 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        {icon && <span className="text-zinc-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** Simple definition list row used in debug panels and metadata. */
export function MetaItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-800">{children}</dd>
    </div>
  );
}

export function RangeInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
  hint,
  aside,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
  aside?: ReactNode;
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <Field label={label} hint={hint} aside={aside ?? <span className="tabular font-medium text-zinc-700">{format(value)}</span>}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-brand-600"
        style={{ background: `linear-gradient(to right, var(--color-brand-600) ${pct}%, #e4e4e7 ${pct}%)` }}
        aria-valuetext={format(value)}
      />
      <div className="flex justify-between text-[11px] text-zinc-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </Field>
  );
}
