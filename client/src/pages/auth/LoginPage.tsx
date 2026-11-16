import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Lock, Mail } from 'lucide-react';
import { Button, Callout, Input } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { authApi } from '../../services/auth';
import { useAuthStore } from '../../stores/auth';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const setSession = useAuthStore((s) => s.setSession);
  const consumeReason = useAuthStore((s) => s.consumeSignOutReason);
  // Read the forced-sign-out reason once (initializer), then clear it from the store.
  const [notice] = useState<string | null>(() => useAuthStore.getState().signOutReason);
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    consumeReason();
  }, [consumeReason]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const { token, user } = await authApi.login({ email: email.trim(), password });
      setSession(token, user); // AuthLayout redirects to ?next or /
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
      <p className="mt-1.5 text-sm text-zinc-500">Sign in to manage your chatbots.</p>
      {notice && (
        <Callout tone="warning" className="mt-6">
          {notice}
        </Callout>
      )}
      <form className="mt-8 space-y-4" onSubmit={submit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leading={<Mail size={16} />}
          error={fieldErrors.email}
          placeholder="you@company.com"
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leading={<Lock size={16} />}
          error={fieldErrors.password}
          placeholder="••••••••"
        />
        {error && !Object.keys(fieldErrors).length && <Callout tone="error">{error}</Callout>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        New here?{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-brand-600 hover:text-brand-700">
          Create an account
        </Link>
      </p>
    </div>
  );
}
