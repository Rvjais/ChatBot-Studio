import { useMemo } from 'react';
import { renderMarkdown } from '../../utils/markdown';
import { cn } from '../../utils/cn';

/**
 * Renders an assistant answer the way the embedded widget does. Safe to inject: the renderer
 * HTML-escapes the text first and only emits a fixed set of tags and http(s)/mailto/tel links.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className={cn('chat-md', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
