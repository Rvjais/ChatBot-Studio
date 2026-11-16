import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Minus, RotateCw, SendHorizontal, X } from 'lucide-react';
import type { WidgetSettings } from '../../types/api';
import { contrastText, safeColor } from '../../utils/color';

/** Panel sizes used by the real widget (widget/src/components/chat-widget.ts). */
const SIZES = { small: [340, 500], medium: [380, 600], large: [440, 700] } as const;

const LIGHT = { bg: '#ffffff', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', bot: '#f1f5f9', botText: '#0f172a', input: '#ffffff' };
const DARK = { bg: '#0f172a', text: '#e5e7eb', muted: '#94a3b8', border: '#1f2937', bot: '#1e293b', botText: '#e5e7eb', input: '#0b1220' };

export interface PreviewProps {
  settings: WidgetSettings;
  name: string;
  welcomeMessage: string;
  placeholder: string;
  dark: boolean;
  open: boolean;
}

/**
 * Live React mock of the embeddable widget: page backdrop, launcher and the open chat panel.
 * Scales down to fit the column while keeping the real pixel dimensions of each size.
 */
export function WidgetPreview({ settings: w, name, welcomeMessage, placeholder, dark, open }: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(480);
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => setAvatarBroken(false), [w.avatarUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setAvailable(e[0]!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [pw, ph] = SIZES[w.size] ?? SIZES.medium;
  const canvasW = pw + 48;
  const canvasH = (open ? ph + 12 : 0) + 56 + 48 + (open ? 0 : 160);
  const scale = Math.min(1, available / canvasW);
  const t = dark ? DARK : LIGHT;
  const primary = safeColor(w.primaryColor, '#4f46e5');
  const primaryText = contrastText(primary);
  const headerBg = safeColor(w.headerBackground, primary);
  const headerText = safeColor(w.headerTextColor, contrastText(headerBg));
  const secondary = safeColor(w.secondaryColor, '#eef2ff');
  const radius = Math.max(0, Math.min(32, w.borderRadius));
  const left = w.position === 'bottom-left';
  const title = w.title || name;
  const initial = (title || '?').trim().charAt(0).toUpperCase();
  const showAvatarImg = w.avatarUrl && /^https?:\/\//i.test(w.avatarUrl) && !avatarBroken;

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="relative overflow-hidden rounded-xl border border-zinc-200"
        style={{ height: canvasH * scale, background: dark ? '#020617' : 'linear-gradient(180deg,#f8fafc,#eef2f7)' }}
      >
        {/* Fake host page */}
        <div className="absolute inset-x-0 top-0 space-y-3 p-5 opacity-60" aria-hidden="true">
          <div className="h-3 w-1/3 rounded-full" style={{ background: dark ? '#1e293b' : '#dbe2ea' }} />
          <div className="h-2 w-2/3 rounded-full" style={{ background: dark ? '#1e293b' : '#e2e8f0' }} />
          <div className="h-2 w-1/2 rounded-full" style={{ background: dark ? '#1e293b' : '#e2e8f0' }} />
        </div>
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: canvasW, height: canvasH, transform: `scale(${scale})`, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: 14, lineHeight: 1.5 }}
        >
          <div className="absolute flex flex-col gap-3" style={{ bottom: 24, [left ? 'left' : 'right']: 24, alignItems: left ? 'flex-start' : 'flex-end' }}>
            {open && (
              <div
                className="flex flex-col overflow-hidden"
                style={{
                  width: pw,
                  height: ph,
                  background: t.bg,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: radius,
                  boxShadow: dark ? '0 24px 60px -12px rgba(0,0,0,.6)' : '0 24px 60px -12px rgba(15,23,42,.28), 0 8px 20px -8px rgba(15,23,42,.18)',
                }}
              >
                <div className="flex items-center gap-3" style={{ padding: '14px 14px 14px 16px', background: headerBg, color: headerText }}>
                  <div
                    className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold"
                    style={{ width: 38, height: 38, background: 'rgba(255,255,255,.18)', fontSize: 16 }}
                  >
                    {showAvatarImg ? <img src={w.avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarBroken(true)} /> : initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontWeight: 650, fontSize: 15 }}>
                      {title || 'Chat'}
                    </div>
                    {w.subtitle && (
                      <div className="flex items-center gap-1.5 truncate" style={{ fontSize: 12, opacity: 0.85 }}>
                        <span className="inline-block shrink-0 rounded-full" style={{ width: 7, height: 7, background: '#22c55e' }} />
                        {w.subtitle}
                      </div>
                    )}
                  </div>
                  <RotateCw size={18} style={{ opacity: 0.9 }} />
                  <Minus size={18} style={{ opacity: 0.9 }} />
                </div>

                <div className="flex flex-1 flex-col gap-2.5 overflow-hidden" style={{ padding: '18px 16px 8px', background: t.bg }}>
                  {welcomeMessage && <Bubble role="assistant" bg={t.bot} color={t.botText} text={welcomeMessage} />}
                  {w.suggestedQuestions.length > 0 && (
                    <div className="flex flex-wrap gap-2" style={{ padding: '2px 0 6px' }}>
                      {w.suggestedQuestions.map((q, i) => (
                        <span
                          key={`${q}-${i}`}
                          style={{
                            border: `1px solid ${i === 0 ? primary : t.border}`,
                            background: i === 0 ? secondary : t.bg,
                            color: i === 0 ? '#0f172a' : t.text,
                            borderRadius: 999,
                            padding: '6px 12px',
                            fontSize: 13,
                            lineHeight: 1.3,
                          }}
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  )}
                  <Bubble role="user" bg={primary} color={primaryText} text="Do you have wireless headphones under ₹3,000?" />
                  <Bubble
                    role="assistant"
                    bg={t.bot}
                    color={t.botText}
                    text="Yes! The Wireless Headphones (P001) are ₹2,499 and currently in stock. Would you like the product link?"
                  />
                </div>

                <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${t.border}`, background: t.bg }}>
                  <div className="flex items-end gap-2" style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.input, padding: '6px 6px 6px 12px' }}>
                    <span className="flex-1 truncate" style={{ color: t.muted, padding: '6px 0' }}>
                      {placeholder || 'Type your message…'}
                    </span>
                    <span className="flex shrink-0 items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: primary, color: primaryText }}>
                      <SendHorizontal size={18} />
                    </span>
                  </div>
                  <div className="flex justify-between" style={{ marginTop: 6, fontSize: 11, color: t.muted }}>
                    <span>{w.showBranding ? 'Powered by AI Chatbot Builder' : ''}</span>
                  </div>
                </div>
              </div>
            )}
            <div
              className="inline-flex items-center justify-center gap-2 rounded-full font-semibold"
              style={{
                height: 56,
                minWidth: 56,
                padding: w.launcherText ? '0 16px' : 0,
                width: w.launcherText ? undefined : 56,
                background: primary,
                color: primaryText,
                fontSize: 15,
                boxShadow: '0 10px 25px -5px rgba(15,23,42,.35)',
              }}
            >
              {open ? <X size={26} /> : <MessageCircle size={26} />}
              {w.launcherText && <span>{w.launcherText}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, bg, color, text }: { role: 'user' | 'assistant'; bg: string; color: string; text: string }) {
  return (
    <div className="flex" style={{ justifyContent: role === 'user' ? 'flex-end' : 'flex-start' }}>
      <div
        className="chat-text"
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 16,
          [role === 'user' ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 6,
          background: bg,
          color,
        }}
      >
        {text}
      </div>
    </div>
  );
}
