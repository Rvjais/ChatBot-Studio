import { Link } from 'react-router';
import { cn } from '../utils/cn';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path
        d="M9 11.5A3.5 3.5 0 0 1 12.5 8h7A3.5 3.5 0 0 1 23 11.5v5a3.5 3.5 0 0 1-3.5 3.5H15l-4.2 3.4c-.5.4-1.3 0-1.3-.6V20.4A3.5 3.5 0 0 1 9 16.5z"
        fill="#fff"
      />
      <circle cx="13.5" cy="14" r="1.4" fill="#4f46e5" />
      <circle cx="18.5" cy="14" r="1.4" fill="#4f46e5" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2.5 rounded-lg', className)} aria-label="Chatbot Studio home">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900">Chatbot Studio</span>
    </Link>
  );
}
