// Shared with the widget (widget/src/utils/markdown.ts) so dashboard previews render answers exactly like visitors see them.
/**
 * Minimal, XSS-safe Markdown renderer for chat messages.
 * Everything is HTML-escaped FIRST; only a fixed set of tags is then produced
 * (p, br, strong, em, code, ul/ol/li, a). Links are restricted to http(s)/mailto/tel
 * and open in a new tab with rel="noopener noreferrer nofollow".
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

function link(href: string, label: string): string {
  // href is already HTML-escaped; decode &amp; only for the scheme check.
  const raw = href.replace(/&amp;/g, '&');
  if (!SAFE_URL.test(raw)) return label;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
}

function inline(escaped: string): string {
  const codeSpans: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => link(href, label))
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,!?;:'"])/g, (_m, pre: string, url: string) => `${pre}${link(url, url)}`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codeSpans[Number(i)]!);
}

export function renderMarkdown(text: string): string {
  const lines = escapeHtml(text.replace(/\r\n?/g, '\n')).split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
    } else if (heading) {
      flushParagraph();
      flushList();
      html.push(`<p><strong>${inline(heading[1]!)}</strong></p>`);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return html.join('');
}
