import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatCompact } from '../../utils/format';
import { controlBase, controlBorder, Field } from '../ui/Field';

export interface ModelOption {
  id: string;
  label?: string;
  contextWindow?: number;
  dimensions?: number;
  pricing?: { inputPerMillion: number; outputPerMillion: number };
  recommended?: boolean;
  notes?: string;
  /** Where the suggestion came from. */
  origin?: 'catalog' | 'live';
}

/** Model picker: suggestions from the catalog / provider plus free text (any model ID works). */
export function ModelCombobox({
  value,
  onChange,
  options,
  label = 'Model',
  hint,
  error,
  placeholder = 'e.g. gpt-4o-mini',
  loading,
  aside,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ModelOption[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  loading?: boolean;
  aside?: ReactNode;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [filterText, setFilterText] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const inputId = useId();

  const filtered = useMemo(() => {
    const q = (filterText ?? '').trim().toLowerCase();
    const list = q ? options.filter((o) => o.id.toLowerCase().includes(q) || o.label?.toLowerCase().includes(q)) : options;
    return list.slice(0, 200);
  }, [options, filterText]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => setHighlight(0), [filterText, open]);

  const pick = (id: string) => {
    onChange(id);
    setFilterText(null);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && open && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]!.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} aside={aside} required={required}>
      <div ref={wrapRef} className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setFilterText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(controlBase, controlBorder(error), 'h-9 pr-9 pl-3 font-mono text-[13px]')}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show model suggestions"
          onClick={() => {
            setFilterText(null);
            setOpen((o) => !o);
          }}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-zinc-400 hover:text-zinc-600"
        >
          <ChevronDown size={16} />
        </button>
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="scrollbar-thin absolute z-30 mt-1 max-h-72 w-full animate-pop-in overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-pop"
          >
            {loading && <li className="px-3 py-2 text-sm text-zinc-500">Loading models…</li>}
            {!loading && filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-zinc-500">
                {options.length ? 'No matching suggestions — the typed model ID will be used as-is.' : 'No suggestions for this provider — type any model ID.'}
              </li>
            )}
            {filtered.map((o, i) => (
              <li
                key={`${o.origin ?? 'c'}-${o.id}`}
                role="option"
                aria-selected={o.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.id);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn('cursor-pointer px-3 py-2', i === highlight ? 'bg-brand-50' : '', o.id === value && 'font-medium')}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-zinc-900">{o.label && o.label !== o.id ? o.label : o.id}</span>
                  {o.recommended && (
                    <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 text-[10px] font-medium text-brand-700 ring-1 ring-brand-200">
                      <Sparkles size={10} /> Recommended
                    </span>
                  )}
                  {o.origin === 'live' && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">Live</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                  {o.label && o.label !== o.id && <span className="font-mono">{o.id}</span>}
                  {o.contextWindow ? <span>{formatCompact(o.contextWindow)} context</span> : null}
                  {o.dimensions ? <span>{o.dimensions} dims</span> : null}
                  {o.pricing ? (
                    <span>
                      ${o.pricing.inputPerMillion} / ${o.pricing.outputPerMillion} per 1M
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
