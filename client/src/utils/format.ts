const numberFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFmt.format(value);
}

/** 1,284 / 12.9K / 4.2M — for stat tiles and axis ticks. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.abs(value) < 10_000 ? numberFmt.format(value) : compactFmt.format(value);
}

/** USD cost; small values keep enough precision to be meaningful. Null means "no pricing data". */
export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(6).replace(/0+$/, '')}`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatPrice(price: number | null | undefined, currency?: string | null): string {
  if (price === null || price === undefined) return '—';
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
    } catch {
      /* unknown currency code */
    }
  }
  return `${numberFmt.format(price)}${currency ? ` ${currency}` : ''}`;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return 'Never';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} d ago`;
  return formatDate(d);
}

/** "2026-11-03" → "Nov 3" (analytics days are UTC). */
export function formatDay(isoDay: string, withYear = false): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...(withYear ? { year: 'numeric' } : {}) });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
