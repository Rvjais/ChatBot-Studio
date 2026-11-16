import { useState } from 'react';
import { cn } from '../../utils/cn';
import { HEX_COLOR } from '../ui/Misc';

/** Chatbot avatar: the widget avatar image when set, otherwise initials on the widget colour. */
export function ChatbotAvatar({
  name,
  color,
  avatarUrl,
  size = 40,
  className,
}: {
  name: string;
  color?: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const bg = color && HEX_COLOR.test(color) ? color : '#4f46e5';
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn('shrink-0 rounded-lg object-cover ring-1 ring-black/5', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ring-1 ring-black/5', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
    >
      {letters || 'AI'}
    </span>
  );
}
