import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { authApi } from '../services/auth';
import { useAuthStore } from '../stores/auth';

/**
 * Guards dashboard routes. With a stored token the shell renders immediately while the
 * session is re-validated in the background; a 401 clears the session (see services/http.ts)
 * and this component then redirects to /login.
 */
export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const location = useLocation();
  const validated = useRef<string | null>(null);

  useEffect(() => {
    if (!token || validated.current === token) return;
    validated.current = token;
    authApi
      .me()
      .then(setUser)
      .catch(() => {
        /* 401 is handled globally; network errors keep the cached session */
      });
  }, [token, setUser]);

  if (!token) {
    const next = location.pathname + location.search;
    return <Navigate to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  }
  return <Outlet />;
}
