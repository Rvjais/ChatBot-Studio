import { useId, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, label, description, size = 'md', className, ...aria }: SwitchProps) {
  const id = useId();
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumb = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  const button = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-brand-600' : 'bg-zinc-300',
      )}
    >
      <span className={cn('inline-block rounded-full bg-white shadow-sm ring-0 transition-transform', thumb, checked ? shift : 'translate-x-0')} />
    </button>
  );
  if (!label && !description) return <span className={className}>{button}</span>;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-zinc-800">
            {label}
          </label>
        )}
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {description}
          </p>
        )}
      </div>
      {button}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-600"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-zinc-800">
          {label}
        </label>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
    </div>
  );
}
