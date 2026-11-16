import axios from 'axios';
import { useAuthStore } from '../stores/auth';

/** Empty = same origin (Vite proxy in development, API-served bundle in production). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

const AUTH_ENTRY_ROUTES = ['/auth/login', '/auth/register'];

/** Clears the session when the API reports it as invalid; ProtectedRoute then redirects to /login. */
export function handleUnauthorized(message?: string) {
  const { token, clearSession } = useAuthStore.getState();
  if (token) clearSession(message || 'Your session has ended. Please sign in again.');
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      if (!AUTH_ENTRY_ROUTES.some((r) => url.endsWith(r))) {
        const data = error.response.data as { error?: { message?: string } } | undefined;
        handleUnauthorized(data?.error?.message);
      }
    }
    return Promise.reject(error);
  },
);
