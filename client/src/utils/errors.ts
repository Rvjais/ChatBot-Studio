import axios from 'axios';
import type { ApiErrorBody, ApiErrorDetail } from '../types/api';

/** Error thrown by non-axios calls (fetch/SSE) with the same shape as server errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const NETWORK_ERROR_MESSAGE = 'Cannot reach the server. Check your connection and that the API is running.';

function bodyOf(err: unknown): ApiErrorBody['error'] | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Partial<ApiErrorBody> | undefined;
    if (data && typeof data === 'object' && data.error && typeof data.error.message === 'string') return data.error;
  }
  return undefined;
}

export function getErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  if (axios.isAxiosError(err)) return err.response?.status;
  return undefined;
}

export function getErrorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.code;
  return bodyOf(err)?.code;
}

/** Human-readable message for any thrown value, preferring the server's `error.message`. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  const body = bodyOf(err);
  if (body) {
    // Validation errors: surface the first detail so the user knows what to fix even without field mapping.
    if (body.code === 'VALIDATION_ERROR' && body.details?.length) {
      const d = body.details[0]!;
      return d.path ? `${body.message} — ${d.path}: ${d.message}` : `${body.message} — ${d.message}`;
    }
    return body.message;
  }
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return 'The request timed out. Please try again.';
    if (!err.response) return NETWORK_ERROR_MESSAGE;
    if (err.response.status === 413) return 'The upload is too large.';
    if (err.response.status === 502 || err.response.status === 504) return 'The API server is unreachable right now.';
    if (err.response.status >= 500) return 'The server had a problem handling this request.';
    return err.message || fallback;
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return NETWORK_ERROR_MESSAGE;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Maps `error.details[].path` → message so forms can show inline errors. */
export function getFieldErrors(err: unknown): Record<string, string> {
  const details = err instanceof ApiError ? err.details : bodyOf(err)?.details;
  const out: Record<string, string> = {};
  for (const d of details ?? []) {
    if (d.path && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}

export function isAbortError(err: unknown): boolean {
  return (err instanceof DOMException && err.name === 'AbortError') || axios.isCancel(err);
}
