/**
 * Post-generation price verification. Every currency amount in the model's answer must match
 * an amount present in the data the model was given (product records, knowledge excerpts,
 * owner instructions) or in the visitor's own message. Unmatched amounts are reported so the
 * engine can append a notice and the owner can review them in the dashboard.
 */
const NUMBER = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?`;
const PREFIXED = new RegExp(String.raw`(?:₹|rs\.?\s?|inr\s?|\$|usd\s?|us\$\s?|€|eur\s?|£|gbp\s?)\s?${NUMBER}`, 'gi');
const SUFFIXED = new RegExp(String.raw`${NUMBER}\s?(?:rs\b|inr\b|rupees?\b|usd\b|dollars?\b|eur\b|euros?\b|gbp\b|pounds?\b|/-)`, 'gi');

function toAmount(intPart: string, frac?: string): number {
  return Number(`${intPart.replace(/,/g, '')}${frac ? `.${frac}` : ''}`);
}

export function extractAmounts(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  for (const re of [PREFIXED, SUFFIXED]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ raw: m[0].trim(), value: toAmount(m[1]!, m[2]) });
  }
  return out;
}

/** All numbers appearing in a body of text (used to whitelist amounts from reference data). */
export function numbersIn(text: string): number[] {
  const nums: number[] = [];
  const re = /\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) nums.push(Number(m[0].replace(/,/g, '')));
  return nums;
}

export interface PriceCheck {
  passed: boolean;
  unverifiedAmounts: string[];
}

export function checkPrices(answer: string, knownAmounts: Iterable<number>): PriceCheck {
  const known = [...knownAmounts].filter((n) => Number.isFinite(n));
  const unverified = extractAmounts(answer)
    .filter(({ value }) => !known.some((k) => Math.abs(k - value) < 0.005))
    .map((a) => a.raw);
  const unique = [...new Set(unverified)];
  return { passed: unique.length === 0, unverifiedAmounts: unique.slice(0, 20) };
}

export const PRICE_NOTICE = '\n\n_Note: please confirm the final price on the product page — only prices listed in our catalog are guaranteed._';
