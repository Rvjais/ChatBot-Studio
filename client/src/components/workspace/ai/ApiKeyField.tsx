import type { ReactNode } from 'react';
import { KeyRound, Undo2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';

export type KeyMode = 'keep' | 'replace' | 'remove';

/**
 * API keys are write-only: the saved key is never sent back, only `••••last4`.
 * The field is never pre-filled and a key is only submitted when the user types a new one.
 */
export function ApiKeyField({
  label = 'API key',
  hasKey,
  last4,
  mode,
  onModeChange,
  value,
  onValueChange,
  hint,
  error,
  placeholder = 'Paste a new API key',
}: {
  label?: ReactNode;
  hasKey: boolean;
  last4: string | null;
  mode: KeyMode;
  onModeChange: (m: KeyMode) => void;
  value: string;
  onValueChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
}) {
  if (hasKey && mode === 'keep') {
    return (
      <Field label={label} hint={hint} error={error}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-zinc-700">
            <KeyRound size={15} className="text-emerald-600" aria-hidden="true" />
            Key saved
            <span className="font-mono text-zinc-500">••••{last4 ?? ''}</span>
          </span>
          <span className="flex gap-1.5">
            <Button size="xs" onClick={() => onModeChange('replace')}>
              Replace
            </Button>
            <Button size="xs" variant="danger-ghost" onClick={() => onModeChange('remove')}>
              Remove
            </Button>
          </span>
        </div>
      </Field>
    );
  }
  if (hasKey && mode === 'remove') {
    return (
      <Field label={label} error={error}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <span className="text-sm text-red-800">
            The saved key <span className="font-mono">••••{last4}</span> will be removed when you save.
          </span>
          <Button size="xs" icon={<Undo2 size={13} />} onClick={() => onModeChange('keep')}>
            Undo
          </Button>
        </div>
      </Field>
    );
  }
  return (
    <Input
      label={label}
      type="password"
      autoComplete="new-password"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      leading={<KeyRound size={15} />}
      onChange={(e) => onValueChange(e.target.value)}
      error={error}
      hint={hint}
      trailing={
        hasKey ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              onValueChange('');
              onModeChange('keep');
            }}
          >
            Cancel
          </Button>
        ) : undefined
      }
    />
  );
}
