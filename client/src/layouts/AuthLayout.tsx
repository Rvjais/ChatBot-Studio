import { Navigate, Outlet, useSearchParams } from 'react-router';
import { BookOpen, Bot, Code, ShieldCheck } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { useAuthStore } from '../stores/auth';

const FEATURES = [
  { icon: Bot, title: 'Any provider, any model', text: 'OpenAI, Claude, Gemini, DeepSeek, OpenRouter or your own endpoint — per chatbot.' },
  { icon: BookOpen, title: 'Grounded answers', text: 'Upload documents and product catalogs; answers cite real records, never invented prices.' },
  { icon: Code, title: 'Embed anywhere', text: 'One script tag for HTML, WordPress, Shopify, React and Next.js sites.' },
  { icon: ShieldCheck, title: 'Secure by default', text: 'Keys encrypted at rest, never sent to the browser, optional domain restrictions.' },
];

/** Only same-app paths are allowed as post-login redirects. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function AuthLayout() {
  const token = useAuthStore((s) => s.token);
  const [params] = useSearchParams();
  if (token) return <Navigate to={safeNext(params.get('next'))} replace />;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-lg font-semibold tracking-tight">Chatbot Studio</span>
          </div>
          <Outlet />
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(60% 50% at 70% 20%, rgba(99,102,241,0.45) 0%, transparent 70%), radial-gradient(50% 50% at 10% 90%, rgba(79,70,229,0.35) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 text-white">
          <p className="text-sm font-medium text-brand-200">AI chatbot builder</p>
          <h2 className="mt-3 max-w-md text-3xl leading-tight font-semibold tracking-tight">
            Launch helpful assistants trained on your own content.
          </h2>
          <ul className="mt-10 grid max-w-lg gap-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
