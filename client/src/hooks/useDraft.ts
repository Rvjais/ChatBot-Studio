import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local editable copy of server data. When the source changes (after a save, or an edit made
 * elsewhere such as the header status toggle), fields the user has not touched follow the new
 * source while unsaved edits are kept. `dirty` compares structurally.
 */
export function useDraft<T extends object>(source: T) {
  const sourceKey = useMemo(() => JSON.stringify(source), [source]);
  const [draft, setDraft] = useState<T>(() => JSON.parse(sourceKey) as T);
  const lastSource = useRef<T>(JSON.parse(sourceKey) as T);
  const lastKey = useRef(sourceKey);

  useEffect(() => {
    if (lastKey.current === sourceKey) return;
    const prevSource = lastSource.current as Record<string, unknown>;
    const nextSource = JSON.parse(sourceKey) as Record<string, unknown>;
    lastKey.current = sourceKey;
    lastSource.current = nextSource as T;
    setDraft((current) => {
      const merged: Record<string, unknown> = { ...nextSource };
      for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
        if (!same(v, prevSource[k])) merged[k] = v; // user edit — keep it
      }
      return merged as T;
    });
  }, [sourceKey]);

  const patch = useCallback((p: Partial<T>) => setDraft((d) => ({ ...d, ...p })), []);
  const reset = useCallback(() => setDraft(JSON.parse(lastKey.current) as T), []);
  const dirty = JSON.stringify(draft) !== sourceKey;

  // After a save, callers set the draft to the saved (server-normalized) values with setDraft(toDraft(updated)).
  return { draft, setDraft, patch, dirty, reset };
}
