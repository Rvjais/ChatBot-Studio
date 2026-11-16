import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-zinc-200 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-zinc-900">{title}</h3>
          {description && <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-zinc-100 bg-zinc-50/60 px-5 py-3', className)}>
      {children}
    </div>
  );
}
