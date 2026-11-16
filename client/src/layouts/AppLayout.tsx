import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BookOpen,
  Bot,
  ChartColumn,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  X,
} from 'lucide-react';
import { authApi } from '../services/auth';
import { useAuthStore } from '../stores/auth';
import { toast } from '../stores/toast';
import { cn } from '../utils/cn';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/chatbots', label: 'My Chatbots', icon: Bot },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: ChartColumn },
  { to: '/api-config', label: 'API Configuration', icon: KeyRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authApi.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    clearSession();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={cn(isActive ? 'text-brand-600' : 'text-zinc-400 group-hover:text-zinc-600')} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{user?.name ?? 'Account'}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Sign out"
            title="Sign out"
          >
            {signingOut ? <Spinner size={16} /> : <LogOut size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          className="-ml-1 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <Logo />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-zinc-950/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-72 max-w-[85%] animate-slide-in-left bg-white shadow-pop">
            <button
              type="button"
              className="absolute top-4 right-3 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
