import { Check } from 'lucide-react';
import type { ProviderDefinition, ProviderId } from '../../../types/api';
import { cn } from '../../../utils/cn';

const ACCENTS: Record<ProviderId, string> = {
  openai: 'bg-zinc-900 text-white',
  deepseek: 'bg-sky-600 text-white',
  anthropic: 'bg-orange-700 text-white',
  gemini: 'bg-blue-600 text-white',
  openrouter: 'bg-violet-600 text-white',
  custom: 'bg-zinc-200 text-zinc-700',
};

const MONO: Record<ProviderId, string> = {
  openai: 'OA',
  deepseek: 'DS',
  anthropic: 'A',
  gemini: 'G',
  openrouter: 'OR',
  custom: '{ }',
};

export function ProviderMonogram({ id, size = 32 }: { id: ProviderId; size?: number }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg font-semibold', ACCENTS[id] ?? ACCENTS.custom)}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {MONO[id] ?? '?'}
    </span>
  );
}

export function ProviderPicker({
  providers,
  value,
  onChange,
}: {
  providers: ProviderDefinition[];
  value: ProviderId;
  onChange: (id: ProviderId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="AI provider" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {providers.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.id)}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
              active ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
            )}
          >
            <ProviderMonogram id={p.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-900">{p.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-zinc-500">{p.description}</span>
            </span>
            {active && (
              <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
