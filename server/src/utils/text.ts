/** Escapes user input for safe use inside a RegExp (prevents ReDoS/regex injection). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes extracted document text: Unicode NFKC, strips control characters,
 * joins hyphenated line breaks and collapses excessive whitespace.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F﻿]/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Rough token estimate (~4 chars/token for English). Used only for budgeting, never billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function slugify(value: string, max = 48): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

const STOPWORDS = new Set(
  `a an the and or but if then else of to in on at by for with about against between into through during before after above below from up down out over under again further once here there when where why how all any both each few more most other some such no nor not only own same so than too very can will just don should now is are was were be been being have has had having do does did doing i me my we our you your he him his she her it its they them their what which who whom this that these those am please tell show give list find want need looking look get let know any anything something cost costs price prices priced much many`.split(
    /\s+/,
  ),
);

/** Lowercased content words for keyword search (stopwords and very short tokens removed). */
export function keywords(text: string, max = 12): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    seen.add(raw);
    if (seen.size >= max) break;
  }
  return [...seen];
}
