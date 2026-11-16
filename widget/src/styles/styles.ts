/**
 * Widget stylesheet, injected into the Shadow DOM. `:host { all: initial }` stops the host
 * page's inherited styles (fonts, colors, line-height) from leaking in, and nothing here
 * can leak out to the host page.
 */
export const styles = /* css */ `
:host {
  all: initial;
  --cb-primary: #4f46e5;
  --cb-primary-text: #ffffff;
  --cb-secondary: #eef2ff;
  --cb-header-bg: #4f46e5;
  --cb-header-text: #ffffff;
  --cb-radius: 16px;
  --cb-width: 380px;
  --cb-height: 600px;
  --cb-z: 2147483000;
  --cb-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
}

.root {
  --bg: #ffffff;
  --surface: #f8fafc;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --bot-bubble: #f1f5f9;
  --bot-text: #0f172a;
  --input-bg: #ffffff;
  --shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.28), 0 8px 20px -8px rgba(15, 23, 42, 0.18);
  font-family: var(--cb-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: var(--cb-z);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.root.left { right: auto; left: 20px; align-items: flex-start; }
.root.dark {
  --bg: #0f172a;
  --surface: #111827;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --border: #1f2937;
  --bot-bubble: #1e293b;
  --bot-text: #e5e7eb;
  --input-bg: #0b1220;
  --shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.6), 0 8px 20px -8px rgba(0, 0, 0, 0.5);
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--cb-primary); outline-offset: 2px; }
/* The composer shows focus on its container (.input-row:focus-within) instead. */
textarea:focus, textarea:focus-visible { outline: none; }

/* ── Launcher ─────────────────────────────────────────── */
.launcher {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 56px; min-width: 56px; padding: 0 16px;
  border: none; border-radius: 999px;
  background: var(--cb-primary); color: var(--cb-primary-text);
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.35);
  transition: transform .18s ease, box-shadow .18s ease;
  font-weight: 600; font-size: 15px;
}
.launcher.icon-only { width: 56px; padding: 0; }
.launcher:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 14px 30px -6px rgba(15, 23, 42, 0.4); }
.launcher svg { width: 26px; height: 26px; flex: none; }
.launcher.open .icon-chat { display: none; }
.launcher:not(.open) .icon-close { display: none; }

/* ── Panel ────────────────────────────────────────────── */
.panel {
  width: var(--cb-width);
  height: min(var(--cb-height), calc(100vh - 110px));
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--cb-radius);
  box-shadow: var(--shadow);
  display: flex; flex-direction: column; overflow: hidden;
  transform-origin: bottom right;
  animation: cb-in .22s cubic-bezier(.2,.8,.2,1);
}
.root.left .panel { transform-origin: bottom left; }
.panel[hidden] { display: none; }
@keyframes cb-in { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: none; } }

.header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 14px 14px 16px;
  background: var(--cb-header-bg); color: var(--cb-header-text);
  flex: none;
}
.avatar {
  width: 38px; height: 38px; border-radius: 999px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.18); font-weight: 700; font-size: 16px; overflow: hidden;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.titles { flex: 1; min-width: 0; }
.title { font-weight: 650; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subtitle { font-size: 12px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.subtitle::before { content: ""; width: 7px; height: 7px; border-radius: 99px; background: #22c55e; flex: none; }
.icon-btn {
  width: 34px; height: 34px; border-radius: 10px; border: none; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; color: inherit; opacity: .9;
}
.icon-btn:hover { background: rgba(255,255,255,.16); opacity: 1; }
.icon-btn svg { width: 18px; height: 18px; }

/* ── Messages ─────────────────────────────────────────── */
.messages {
  flex: 1; overflow-y: auto; padding: 18px 16px 8px;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--bg);
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}
.msg { display: flex; max-width: 100%; }
.msg.user { justify-content: flex-end; }
.bubble {
  max-width: 85%; padding: 10px 14px; border-radius: 16px;
  word-wrap: break-word; overflow-wrap: anywhere; white-space: normal;
}
.msg.assistant .bubble { background: var(--bot-bubble); color: var(--bot-text); border-bottom-left-radius: 6px; }
.msg.user .bubble { background: var(--cb-primary); color: var(--cb-primary-text); border-bottom-right-radius: 6px; white-space: pre-wrap; }
.msg.error .bubble { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.root.dark .msg.error .bubble { background: #3f1d1d; color: #fecaca; border-color: #7f1d1d; }
.bubble p { margin: 0 0 8px; }
.bubble p:last-child { margin-bottom: 0; }
.bubble ul, .bubble ol { margin: 4px 0 8px; padding-left: 20px; }
.bubble li { margin: 2px 0; }
.bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.bubble code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 5px; }
.bubble em { font-style: italic; }
.bubble strong { font-weight: 650; }
.retry { margin-top: 8px; border: 1px solid currentColor; background: transparent; border-radius: 8px; padding: 4px 10px; font-size: 12px; }

.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing span { width: 7px; height: 7px; border-radius: 99px; background: var(--muted); animation: cb-blink 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: .15s; }
.typing span:nth-child(3) { animation-delay: .3s; }
@keyframes cb-blink { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

.suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0 6px; }
.chip {
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  border-radius: 999px; padding: 6px 12px; font-size: 13px; line-height: 1.3; text-align: left;
  transition: border-color .15s, background .15s;
}
.chip:hover { border-color: var(--cb-primary); background: var(--cb-secondary); color: #0f172a; }

/* ── Composer ─────────────────────────────────────────── */
.composer { flex: none; padding: 10px 12px 12px; border-top: 1px solid var(--border); background: var(--bg); }
.input-row {
  display: flex; align-items: flex-end; gap: 8px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--input-bg);
  padding: 6px 6px 6px 12px; transition: border-color .15s, box-shadow .15s;
}
.input-row:focus-within { border-color: var(--cb-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cb-primary) 18%, transparent); }
textarea {
  flex: 1; border: none; outline: none; resize: none; background: transparent; color: var(--text);
  font: inherit; line-height: 1.45; max-height: 120px; min-height: 22px; padding: 6px 0;
}
textarea::placeholder { color: var(--muted); }
.send {
  width: 36px; height: 36px; flex: none; border: none; border-radius: 10px;
  background: var(--cb-primary); color: var(--cb-primary-text);
  display: inline-flex; align-items: center; justify-content: center;
  transition: opacity .15s, transform .15s;
}
.send:disabled { opacity: .4; cursor: not-allowed; }
.send:not(:disabled):hover { transform: scale(1.05); }
.send svg { width: 18px; height: 18px; }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 11px; color: var(--muted); }
.footer .count.over { color: #dc2626; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

/* ── Mobile: full screen panel ────────────────────────── */
@media (max-width: 520px) {
  .root { bottom: 16px; right: 16px; }
  .root.left { left: 16px; }
  .root.is-open { inset: 0; bottom: 0; right: 0; gap: 0; }
  .root.is-open .panel { width: 100vw; height: 100%; max-height: none; border-radius: 0; border: none; }
  .root.is-open .launcher { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .launcher, .typing span { animation: none; transition: none; }
}
`;
