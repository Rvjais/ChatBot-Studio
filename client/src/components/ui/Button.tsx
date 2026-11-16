import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '../../utils/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/60',
  secondary: 'bg-white text-zinc-800 border border-zinc-200 shadow-sm hover:bg-zinc-50 hover:border-zinc-300 disabled:text-zinc-400',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600/60',
  'danger-ghost': 'text-red-600 hover:bg-red-50 hover:text-red-700 disabled:text-red-300',
  link: 'text-brand-600 hover:text-brand-700 hover:underline underline-offset-4 px-0! h-auto!',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
};

const iconOnlySizes: Record<ButtonSize, string> = {
  xs: 'h-7 w-7 rounded-md',
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-lg',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', iconOnly = false, className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
    variants[variant],
    iconOnly ? iconOnlySizes[size] : sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Square icon button; requires an aria-label. */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, iconOnly, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'xs' ? 12 : 14} /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={buttonClasses(variant, size, false, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
