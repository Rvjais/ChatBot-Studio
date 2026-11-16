import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Lock, Mail, User } from 'lucide-react';
import { Button, Callout, Input } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { authApi } from '../../services/auth';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include both letters and numbers';
  return null;
}

export function RegisterPage() {
  useDocumentTitle('Create account');
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const pwProblem = passwordProblem(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (pwProblem || !name.trim() || !email.trim()) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const { token, user } = await authApi.register({ name: name.trim(), email: email.trim(), password });
      setSession(token, user);
      toast.success(`Welcome, ${user.name.split(' ')[0]}!`, 'Create your first chatbot to get started.');
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
      <p className="mt-1.5 text-sm text-zinc-500">Build and embed your first AI chatbot in minutes.</p>
      <form className="mt-8 space-y-4" onSubmit={submit} noValidate>
        <Input
          label="Full name"
          autoComplete="name"
          required
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          leading={<User size={16} />}
          error={fieldErrors.name ?? (touched && !name.trim() ? 'Enter your name' : undefined)}
          placeholder="Ada Lovelace"
          autoFocus
        />
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leading={<Mail size={16} />}
          error={fieldErrors.email ?? (touched && !email.trim() ? 'Enter your email' : undefined)}
          placeholder="you@company.com"
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leading={<Lock size={16} />}
          error={fieldErrors.password ?? (touched && pwProblem ? pwProblem : undefined)}
          hint="At least 8 characters, with letters and numbers."
          placeholder="••••••••"
        />
        {error && !Object.keys(fieldErrors).length && <Callout tone="error">{error}</Callout>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
