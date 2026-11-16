import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Lock, LogOut, User } from 'lucide-react';
import { Button, Callout, Card, CardBody, CardFooter, CardHeader, ConfirmDialog, Input, PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { authApi } from '../services/auth';
import { useAuthStore } from '../stores/auth';
import { toast } from '../stores/toast';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { formatDate } from '../utils/format';
import { passwordProblem } from './auth/RegisterPage';

function ProfileCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== (user?.name ?? '');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name cannot be empty');
    setBusy(true);
    setError(null);
    try {
      const updated = await authApi.updateProfile(name.trim());
      setUser(updated);
      setName(updated.name);
      toast.success('Profile updated');
    } catch (err) {
      setError(getFieldErrors(err).name ?? getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save}>
        <CardHeader icon={<User size={16} />} title="Profile" description={user ? `Member since ${formatDate(user.createdAt)}` : undefined} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={error ?? undefined} />
          <Input label="Email" value={user?.email ?? ''} disabled hint="Email changes are not supported." />
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const setToken = useAuthStore((s) => s.setToken);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const problem = passwordProblem(next);
  const mismatch = confirm && confirm !== next ? 'Passwords do not match' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!current || problem || mismatch || !confirm) return;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const { token, message } = await authApi.changePassword(current, next);
      setToken(token); // all other sessions were revoked; keep this one signed in
      setCurrent('');
      setNext('');
      setConfirm('');
      setTouched(false);
      toast.success(message || 'Password updated', 'Other devices have been signed out.');
    } catch (err) {
      const fe = getFieldErrors(err);
      setErrors(fe);
      if (!Object.keys(fe).length) setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader icon={<Lock size={16} />} title="Change password" description="Changing your password signs you out on every other device." />
        <CardBody className="space-y-4">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword ?? (touched && !current ? 'Enter your current password' : undefined)}
            containerClassName="sm:max-w-sm"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={errors.newPassword ?? (touched && problem ? problem : undefined)}
              hint="At least 8 characters, with letters and numbers."
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={(touched || confirm) && mismatch ? mismatch : touched && !confirm ? 'Confirm the new password' : undefined}
            />
          </div>
          {error && <Callout tone="error">{error}</Callout>}
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={busy}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader icon={<LogOut size={16} />} title="Sessions" description="Sign out everywhere, including this browser — for example after using a shared computer." />
      <CardFooter className="justify-start">
        <Button variant="danger-ghost" className="border border-red-200" icon={<LogOut size={15} />} onClick={() => setOpen(true)}>
          Sign out of all sessions
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Sign out everywhere?"
        confirmLabel="Sign out of all sessions"
        description="Every device signed in to this account, including this one, will need to sign in again."
        onConfirm={async () => {
          await authApi.logout();
          clearSession();
          toast.success('Signed out of all sessions');
          navigate('/login', { replace: true });
        }}
      />
    </Card>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Manage your account and security." />
      <div className="space-y-6">
        <ProfileCard />
        <PasswordCard />
        <SessionsCard />
      </div>
    </div>
  );
}
