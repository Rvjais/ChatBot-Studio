import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export function Table({ children, className, minWidth = 640 }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-medium tracking-wide text-zinc-500 uppercase">
      {children}
    </thead>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('px-4 py-2.5 font-medium whitespace-nowrap', className)} {...rest}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-100">{children}</tbody>;
}

export function TR({ className, children, interactive, ...rest }: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr className={cn('transition-colors', interactive && 'cursor-pointer hover:bg-zinc-50', className)} {...rest}>
      {children}
    </tr>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 align-middle text-zinc-700', className)} {...rest}>
      {children}
    </td>
  );
}
