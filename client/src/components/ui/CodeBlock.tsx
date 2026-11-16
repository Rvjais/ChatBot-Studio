import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { CopyButton } from './CopyButton';

export function CodeBlock({
  code,
  title,
  language,
  className,
  actions,
  maxHeight = 420,
}: {
  code: string;
  title?: ReactNode;
  language?: string;
  className?: string;
  actions?: ReactNode;
  maxHeight?: number;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-400">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </span>
          <span className="truncate">{title}</span>
          {language && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-wide text-zinc-300 uppercase">{language}</span>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <CopyButton
            text={code}
            size="xs"
            variant="ghost"
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
          />
        </div>
      </div>
      <pre className="scrollbar-thin overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-zinc-100" style={{ maxHeight }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800">{children}</code>;
}
