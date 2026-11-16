import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export const controlBase =
  'block w-full rounded-lg border bg-white text-sm text-zinc-900 placeholder:text-zinc-400 shadow-xs transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500';

export const controlBorder = (error?: string | boolean) =>
  error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-zinc-300 focus:border-brand-500';

interface FieldWrapperProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  /** Right-aligned text next to the label, e.g. a character counter. */
  aside?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, aside, children }: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label ? (
            <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-800">
              {label}
              {required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
          ) : (
            <span />
          )}
          {aside && <span className="text-xs text-zinc-500">{aside}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

type CommonProps = { label?: ReactNode; hint?: ReactNode; error?: string; aside?: ReactNode; containerClassName?: string };

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, CommonProps {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, aside, containerClassName, leading, trailing, className, id, required, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const control = (
    <div className="relative">
      {leading && <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">{leading}</span>}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, controlBorder(error), 'h-9 px-3', leading && 'pl-9', trailing && 'pr-10', className)}
        {...rest}
      />
      {trailing && <span className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</span>}
    </div>
  );
  if (!label && !hint && !error && !aside) return <div className={containerClassName}>{control}</div>;
  return (
    <Field label={label} hint={hint} error={error} aside={aside} required={required} htmlFor={inputId} className={containerClassName}>
      {control}
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, CommonProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, aside, containerClassName, className, id, required, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} aside={aside} required={required} htmlFor={inputId} className={containerClassName}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, controlBorder(error), 'px-3 py-2 leading-relaxed', className)}
        {...rest}
      />
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, CommonProps {
  options?: { value: string; label: string; disabled?: boolean }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, aside, containerClassName, className, id, options, children, required, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const control = (
    <div className="relative">
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, controlBorder(error), 'h-9 appearance-none pr-9 pl-3', className)}
        {...rest}
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
    </div>
  );
  if (!label && !hint && !error && !aside) return <div className={containerClassName}>{control}</div>;
  return (
    <Field label={label} hint={hint} error={error} aside={aside} required={required} htmlFor={inputId} className={containerClassName}>
      {control}
    </Field>
  );
});

/** Numeric input that reports `null` for an empty field. */
export function NumberInput({
  value,
  onValueChange,
  ...rest
}: Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: number | null | undefined; onValueChange: (v: number | null) => void }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value === null || value === undefined || Number.isNaN(value) ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') onValueChange(null);
        else {
          const n = Number(raw);
          if (!Number.isNaN(n)) onValueChange(n);
        }
      }}
      {...rest}
    />
  );
}
