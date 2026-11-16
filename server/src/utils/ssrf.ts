import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '../config/env.js';
import { badRequest } from './errors.js';

/**
 * Server-side request forgery guard for user-supplied provider base URLs. In production
 * (unless ALLOW_PRIVATE_PROVIDER_URLS=true) a base URL must use https and resolve only to
 * public addresses — blocking access to localhost, private networks and cloud metadata.
 */
function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

const cache = new Map<string, { ok: boolean; at: number }>();
const TTL = 10 * 60 * 1000;

export async function assertSafeBaseUrl(raw: string | undefined | null): Promise<void> {
  if (!raw) return;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Base URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw badRequest('Base URL must use http or https');
  if (url.username || url.password) throw badRequest('Base URL must not contain credentials');
  if (env.allowPrivateProviderUrls) return;
  if (url.protocol !== 'https:') throw badRequest('Base URL must use https');

  const hit = cache.get(url.hostname);
  if (hit && Date.now() - hit.at < TTL) {
    if (!hit.ok) throw badRequest('Base URL must point to a public host');
    return;
  }
  let addresses: string[];
  try {
    addresses = net.isIP(url.hostname) ? [url.hostname] : (await dns.lookup(url.hostname, { all: true })).map((a) => a.address);
  } catch {
    throw badRequest(`Could not resolve host "${url.hostname}"`);
  }
  const ok = addresses.length > 0 && !addresses.some(isPrivateAddress);
  cache.set(url.hostname, { ok, at: Date.now() });
  if (!ok) throw badRequest('Base URL must point to a public host');
}
