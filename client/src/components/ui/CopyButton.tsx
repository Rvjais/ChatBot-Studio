import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from '../../stores/toast';
import { copyToClipboard } from '../../utils/clipboard';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  size = 'sm',
  variant = 'secondary',
  iconOnly,
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  iconOnly?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const onClick = async () => {
    if (await copyToClipboard(text)) setCopied(true);
    else toast.error('Copy failed', 'Select the text and copy it manually.');
  };

  return (
    <Button
      size={size}
      variant={variant}
      iconOnly={iconOnly}
      onClick={onClick}
      className={className}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      icon={copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    >
      {!iconOnly && (copied ? copiedLabel : label)}
    </Button>
  );
}
