/**
 * Domain allow-list helpers for widget embedding restrictions.
 *
 * Allowed entries may be:
 *   - "example.com"        → matches example.com and www.example.com
 *   - "*.example.com"      → matches any subdomain (and the apex)
 *   - "shop.example.com"   → exact host
 *   - "localhost:3000"     → host with explicit port
 *   - "https://example.com" → scheme is ignored; host is used
 *
 * Note: the Origin header is a browser-enforced signal. It stops other websites from
 * embedding the widget, but non-browser clients can forge it — rate limiting and per-chatbot
 * limits remain the backstop against scripted abuse.
 */
export function normalizeDomainEntry(entry: string): string | null {
  let value = entry.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '');
  if (!/^(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/.test(value)) return null;
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) return null;
  return value;
}

export function hostFromOrigin(origin: string | undefined | null): string | null {
  if (!origin || origin === 'null') return null;
  try {
    const url = new URL(origin);
    return url.port ? `${url.hostname.toLowerCase()}:${url.port}` : url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isHostAllowed(host: string, allowed: string[]): boolean {
  const [hostname, port] = host.split(':') as [string, string | undefined];
  return allowed.some((rawEntry) => {
    const entry = normalizeDomainEntry(rawEntry);
    if (!entry) return false;
    const [entryHost, entryPort] = entry.split(':') as [string, string | undefined];
    if (entryPort && entryPort !== port) return false;
    if (entryHost.startsWith('*.')) {
      const base = entryHost.slice(2);
      return hostname === base || hostname.endsWith(`.${base}`);
    }
    return hostname === entryHost || hostname === `www.${entryHost}`;
  });
}
