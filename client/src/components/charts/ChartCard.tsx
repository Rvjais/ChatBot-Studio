import { useState, type ReactNode } from 'react';
import { ChartColumn, Table as TableIcon } from 'lucide-react';
import { formatDay, formatNumber } from '../../utils/format';
import { cn } from '../../utils/cn';
import { Card, CardHeader } from '../ui/Card';
import { SegmentedControl } from '../ui/Tabs';
import { ColumnChart, type ColumnDatum } from './ColumnChart';

/** Card with a column chart and its table-view twin (every value is reachable without hovering). */
export function ChartCard({
  title,
  description,
  data,
  seriesLabel,
  height = 200,
  emptyMessage,
  refreshing,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  data: ColumnDatum[];
  seriesLabel: string;
  height?: number;
  emptyMessage?: string;
  refreshing?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Chart view"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: <ChartColumn size={14} aria-label="Chart" /> },
              { value: 'table', label: <TableIcon size={14} aria-label="Table" /> },
            ]}
          />
        }
      />
      <div className={cn('px-5 pt-4 pb-3 transition-opacity', refreshing && 'opacity-50')}>
        {view === 'chart' ? (
          <ColumnChart data={data} seriesLabel={seriesLabel} height={height} emptyMessage={emptyMessage} />
        ) : (
          <div className="scrollbar-thin overflow-y-auto" style={{ maxHeight: height + 48 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="py-2 text-left font-medium">Date</th>
                  <th className="py-2 text-right font-medium">{seriesLabel}</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-zinc-100">
                {[...data].reverse().map((d) => (
                  <tr key={d.key}>
                    <td className="py-1.5 text-zinc-600">{formatDay(d.key, true)}</td>
                    <td className="py-1.5 text-right font-medium text-zinc-900">{formatNumber(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {footer && <div className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">{footer}</div>}
    </Card>
  );
}

/**
 * Input vs output token split as a tall segmented bar (one whole, two parts).
 * Shares print inside a part only when it is wide enough; the legend names the parts.
 */
export function TokenSplitBar({ input, output }: { input: number; output: number }) {
  const total = input + output;
  if (total <= 0) {
    return <div className="flex h-7 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-400">No token usage recorded</div>;
  }
  const parts = [
    { label: 'Input tokens', value: input, color: 'var(--color-chart-series)', text: '#ffffff' },
    { label: 'Output tokens', value: output, color: 'var(--color-chart-series-2)', text: '#ffffff' },
  ];
  return (
    <div>
      <div
        className="flex h-7 w-full gap-[2px]"
        role="img"
        aria-label={`Input tokens ${formatNumber(input)} (${Math.round((input / total) * 100)}%), output tokens ${formatNumber(output)} (${Math.round((output / total) * 100)}%)`}
      >
        {parts.map((p) => {
          if (p.value <= 0) return null;
          const share = p.value / total;
          return (
            <div
              key={p.label}
              title={`${p.label}: ${formatNumber(p.value)} (${(share * 100).toFixed(1)}%)`}
              className="flex h-full min-w-[3px] items-center overflow-hidden rounded px-2 text-xs font-medium"
              style={{ width: `${share * 100}%`, background: p.color, color: p.text }}
            >
              {share >= 0.12 && `${Math.round(share * 100)}%`}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            {p.label} <span className="tabular font-medium text-zinc-900">{formatNumber(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
