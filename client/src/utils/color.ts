const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function safeColor(value: string | undefined | null, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  h = h.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or near-black text, whichever reads better on the given background (same rule as the widget). */
export function contrastText(bg: string): string {
  if (!HEX.test(bg)) return '#ffffff';
  const L = luminance(bg);
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#0f172a';
}

export function contrastRatio(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
