/** localStorage wrapper that never throws (private mode, blocked storage, sandboxed iframes). */
const memory = new Map<string, string>();

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
};

function randomId(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  (window.crypto ?? (window as unknown as { msCrypto: Crypto }).msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Anonymous, random visitor identifier (no personal data, no fingerprinting). */
export function getVisitorId(): string {
  const key = 'aicb:visitor';
  let id = storage.get(key);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = `v_${randomId(22)}`;
    storage.set(key, id);
  }
  return id;
}

export const conversationKey = (publicId: string) => `aicb:${publicId}:conversation`;
