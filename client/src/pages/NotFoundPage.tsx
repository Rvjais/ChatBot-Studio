import { useRouteError, isRouteErrorResponse } from 'react-router';
import { Compass, TriangleExclamationPoint } from 'lucide-react';
import { ButtonLink } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Compass size={22} />
      </div>
      <h1 className="text-xl font-semibold text-zinc-900">Page not found</h1>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">The page you are looking for does not exist or was moved.</p>
      <ButtonLink to="/" variant="primary" className="mt-6">
        Back to overview
      </ButtonLink>
    </div>
  );
}

/** Router-level error boundary: unexpected render errors never leave a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
        <TriangleExclamationPoint size={22} />
      </div>
      <h1 className="text-xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-1.5 max-w-md text-sm break-words text-zinc-500">{message}</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50">
          Reload page
        </button>
        <a href="/" className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          Go to overview
        </a>
      </div>
    </div>
  );
}
