import { DEFAULT_LIMITS, fetchPlatformLimits } from '../services/catalog';
import type { PlatformLimits } from '../types/api';
import { useAsync } from './useAsync';

/** Configured upload/product/widget limits; falls back to the server defaults while loading or on error. */
export function usePlatformLimits(): PlatformLimits {
  const { data } = useAsync(() => fetchPlatformLimits(), []);
  return data ?? DEFAULT_LIMITS;
}
