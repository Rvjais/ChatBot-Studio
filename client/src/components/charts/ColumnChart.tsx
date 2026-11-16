import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatCompact, formatDay, formatNumber } from '../../utils/format';

export interface ColumnDatum {
  /** ISO day (YYYY-MM-DD) or any category label. */
  key: string;
  value: number;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  /** Plot height in px (the x-axis band is added on top of this). */
  height?: number;
  /** Series name used in the tooltip and accessible label, e.g. "Conversations". */
  seriesLabel: string;
  /** Formats the x key for axis/tooltip. Defaults to day formatting. */
  formatKey?: (key: string, long?: boolean) => string;
  emptyMessage?: string;
  color?: string;
}

const AXIS_BAND = 26;
const TOP_PAD = 22;

/** Integer-friendly "nice" ticks from 0 to a rounded max. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  let step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
  step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** Column path: square at the baseline, 4px rounded data-end. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

export function ColumnChart({
  data,
  height = 200,
  seriesLabel,
  formatKey = (k, long) => formatDay(k, long),
  emptyMessage = 'No activity in this period yet',
  color = 'var(--color-chart-series)',
}: ColumnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const descId = useId();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0]!.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const max = useMemo(() => data.reduce((m, d) => Math.max(m, d.value), 0), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const allZero = max === 0;

  const tickLabelWidth = Math.max(...ticks.map((t) => formatCompact(t).length)) * 7 + 10;
  const left = allZero ? 8 : tickLabelWidth;
  const right = 8;
  const plotW = Math.max(0, width - left - right);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const plotTop = TOP_PAD;
  const plotH = height;
  const baseline = plotTop + plotH;
  const y = (v: number) => baseline - (v / top) * plotH;

  const maxLabels = Math.max(2, Math.floor(plotW / 58));
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const peakIndex = allZero ? -1 : data.findIndex((d) => d.value === max);
  // Evenly spaced x labels; the last point is labelled only when it doesn't crowd its neighbour.
  const labelIndices = new Set<number>();
  for (let i = 0; i < data.length; i += labelStep) labelIndices.add(i);
  const lastIdx = data.length - 1;
  if (lastIdx > 0 && !labelIndices.has(lastIdx) && lastIdx % labelStep >= labelStep * 0.6) labelIndices.add(lastIdx);

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!data.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((cur) => {
        const start = cur ?? (e.key === 'ArrowRight' ? -1 : data.length);
        return Math.min(data.length - 1, Math.max(0, start + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Escape') setActive(null);
  };

  const activeDatum = active !== null ? data[active] : undefined;
  const tooltipLeft = active !== null ? left + band * active + band / 2 : 0;

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: plotTop + plotH + AXIS_BAND }}>
      {width > 0 && (
        <svg
          width={width}
          height={plotTop + plotH + AXIS_BAND}
          role="img"
          aria-label={`${seriesLabel}: column chart, ${data.length} points, total ${formatNumber(total)}, peak ${formatNumber(max)}.`}
          aria-describedby={descId}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="overflow-visible outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
        >
          <desc id={descId}>Use the left and right arrow keys to read each value.</desc>
          {/* Gridlines + y ticks (hairline, recessive) */}
          {!allZero &&
            ticks.map((t) => (
              <g key={t}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={Math.round(y(t)) + 0.5}
                  y2={Math.round(y(t)) + 0.5}
                  stroke={t === 0 ? 'var(--color-chart-axis)' : 'var(--color-chart-grid)'}
                  strokeWidth={1}
                />
                <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-zinc-400 text-[11px]">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
          {allZero && <line x1={left} x2={width - right} y1={baseline + 0.5} y2={baseline + 0.5} stroke="var(--color-chart-axis)" strokeWidth={1} />}

          {/* Active band wash */}
          {active !== null && (
            <rect x={left + band * active} y={plotTop - 6} width={band} height={plotH + 6} rx={4} className="fill-zinc-100/80" />
          )}

          {/* Columns */}
          {data.map((d, i) => {
            if (d.value <= 0) return null;
            const h = Math.max(1, baseline - y(d.value));
            const x = left + band * i + (band - barW) / 2;
            return (
              <path
                key={d.key}
                d={columnPath(x, baseline - h, barW, h)}
                fill={color}
                opacity={active === null || active === i ? 1 : 0.55}
                className="transition-opacity"
              />
            );
          })}

          {/* Selective direct label: the peak only */}
          {peakIndex >= 0 && active === null && (
            <text
              x={left + band * peakIndex + band / 2}
              y={y(max) - 6}
              textAnchor="middle"
              className="tabular fill-zinc-700 text-[11px] font-medium"
            >
              {formatCompact(max)}
            </text>
          )}

          {/* X labels */}
          {data.map((d, i) =>
            labelIndices.has(i) ? (
              <text key={d.key} x={left + band * i + band / 2} y={baseline + 17} textAnchor="middle" className="fill-zinc-400 text-[11px]">
                {formatKey(d.key)}
              </text>
            ) : null,
          )}

          {/* Hit targets: the whole band, larger than the mark (no hover layer when there is no data) */}
          {!allZero && data.map((d, i) => (
            <rect
              key={`hit-${d.key}`}
              x={left + band * i}
              y={plotTop - 6}
              width={band}
              height={plotH + 6}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerMove={() => setActive(i)}
              onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
            />
          ))}
        </svg>
      )}

      {allZero && width > 0 && (
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-sm text-zinc-400" style={{ top: plotTop, height: plotH }}>
          {emptyMessage}
        </div>
      )}

      {activeDatum && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-pop"
          style={{
            left: Math.min(Math.max(tooltipLeft, 70), Math.max(70, width - 70)),
            top: Math.max(0, y(activeDatum.value) - 12),
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="tabular text-sm font-semibold text-zinc-900">{formatNumber(activeDatum.value)}</p>
          <p className="flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-500">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
            {seriesLabel} · {formatKey(activeDatum.key, true)}
          </p>
        </div>
      )}
    </div>
  );
}
