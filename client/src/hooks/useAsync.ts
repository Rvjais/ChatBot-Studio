import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  /** True only while there is no data yet (initial load or after an error). */
  loading: boolean;
  /** True while re-fetching with data already on screen (keep the frame, dim it). */
  refreshing: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Minimal data-fetching hook: runs `fn` when deps change, ignores stale responses,
 * keeps previous data during refetches and exposes reload/setData for optimistic updates.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, options: { enabled?: boolean } = {}): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<boolean>(enabled);
  const requestId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setPending(true);
    try {
      const result = await fnRef.current();
      if (id === requestId.current) {
        setDataState(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err);
    } finally {
      if (id === requestId.current) setPending(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPending(false);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);

  return {
    data,
    error,
    loading: pending && data === undefined,
    refreshing: pending && data !== undefined,
    reload: run,
    setData,
  };
}
