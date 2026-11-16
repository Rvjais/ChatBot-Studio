import { fetchConversation, sendMessage, WidgetApiError } from '../services/api';
import { conversationKey, getVisitorId, storage } from '../services/storage';
import { styles } from '../styles/styles';
import type { ChatMessage, ResolvedConfig } from '../types';
import { contrastText, safeColor } from '../utils/color';
import { escapeHtml, renderMarkdown } from '../utils/markdown';
import { icons } from './icons';

const SIZES = { small: [340, 500], medium: [380, 600], large: [440, 700] } as const;

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

function visitorErrorMessage(err: unknown): string {
  if (err instanceof WidgetApiError) {
    if (err.status === 429 || err.code === 'RATE_LIMITED') return "You're sending messages too quickly. Please wait a moment and try again.";
    if (err.code === 'CONVERSATION_LIMIT') return 'This conversation is quite long. Please start a new conversation to continue.';
    if (err.code === 'DOMAIN_NOT_ALLOWED') return "This chat isn't available on this website.";
    if (err.status === 404) return 'This chat is currently unavailable.';
    if (err.status === 400 || err.status === 413) return err.message;
  }
  if (err instanceof TypeError) return "Can't reach the chat service. Check your connection and try again.";
  return 'Something went wrong. Please try again.';
}

/**
 * Framework-free chat widget rendered inside a Shadow DOM so it works on any site
 * (plain HTML, WordPress, Shopify, React/Next.js…) without style conflicts.
 */
export class ChatWidget {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private root!: HTMLDivElement;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private list!: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private counter!: HTMLSpanElement;
  private live!: HTMLDivElement;

  private messages: ChatMessage[] = [];
  private conversationId: string | null;
  private readonly visitorId: string;
  private products: unknown[] = [];
  private sending = false;
  private isOpen = false;
  private historyRequested = false;
  private abort: AbortController | null = null;
  private lastUserMessage: string | null = null;
  private renderScheduled = new Set<string>();
  private mql: MediaQueryList | null = null;
  private readonly onThemeChange = () => this.applyTheme();

  constructor(private readonly config: ResolvedConfig, products: unknown[] = []) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-ai-chatbot', config.publicId);
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.visitorId = getVisitorId();
    this.conversationId = storage.get(conversationKey(config.publicId));
    this.setProducts(products);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  mount(): void {
    this.build();
    document.body.appendChild(this.host);
    if (this.config.openOnLoad || this.config.widget.autoOpen) this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.hidden = false;
    this.root.classList.add('is-open');
    this.launcher.classList.add('open');
    this.launcher.setAttribute('aria-expanded', 'true');
    this.launcher.setAttribute('aria-label', 'Close chat');
    void this.restoreHistory();
    this.scrollToBottom();
    setTimeout(() => this.input.focus(), 50);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.hidden = true;
    this.root.classList.remove('is-open');
    this.launcher.classList.remove('open');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-label', 'Open chat');
    this.launcher.focus();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Validates and stores page-provided products (bounded by the server's limits). */
  setProducts(products: unknown): void {
    if (products === undefined || products === null) {
      this.products = [];
      return;
    }
    if (!Array.isArray(products)) {
      console.warn('[AIChatbot] products must be an array; ignoring.');
      return;
    }
    const { maxProducts, maxProductsBytes } = this.config.limits;
    let list = products.filter((p) => p && typeof p === 'object' && !Array.isArray(p)).slice(0, maxProducts);
    if (products.length > maxProducts) {
      console.warn(`[AIChatbot] Only the first ${maxProducts} products are sent. Use the product sync API for large catalogs.`);
    }
    while (list.length && new Blob([JSON.stringify(list)]).size > maxProductsBytes) list = list.slice(0, Math.floor(list.length * 0.8));
    if (list.length < Math.min(products.length, maxProducts)) {
      console.warn(`[AIChatbot] Product data exceeds ${maxProductsBytes} bytes; sending the first ${list.length} products.`);
    }
    this.products = list;
  }

  async sendMessage(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.sending) return;
    if (!this.isOpen) this.open();
    if (message.length > this.config.limits.maxMessageChars) {
      this.pushMessage({ id: nextId(), role: 'assistant', content: `Please keep messages under ${this.config.limits.maxMessageChars} characters.`, status: 'error' });
      return;
    }
    this.pushMessage({ id: nextId(), role: 'user', content: message, status: 'done' });
    await this.requestAnswer(message);
  }

  resetConversation(): void {
    this.abort?.abort();
    this.abort = null;
    this.sending = false;
    this.conversationId = null;
    this.lastUserMessage = null;
    storage.remove(conversationKey(this.config.publicId));
    this.messages = [];
    this.list.replaceChildren();
    this.renderWelcome();
    this.updateComposer();
    this.announce('Started a new conversation');
  }

  destroy(): void {
    this.abort?.abort();
    this.mql?.removeEventListener?.('change', this.onThemeChange);
    this.host.remove();
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  private build(): void {
    const c = this.config;
    const w = c.widget;
    const primary = safeColor(c.widget.primaryColor, '#4f46e5');
    const headerBg = safeColor(w.headerBackground, primary);
    const [width, height] = SIZES[w.size] ?? SIZES.medium;

    const style = document.createElement('style');
    style.textContent = `${styles}
:host {
  --cb-primary: ${primary};
  --cb-primary-text: ${contrastText(primary)};
  --cb-secondary: ${safeColor(w.secondaryColor, '#eef2ff')};
  --cb-header-bg: ${headerBg};
  --cb-header-text: ${safeColor(w.headerTextColor, contrastText(headerBg))};
  --cb-radius: ${Math.max(0, Math.min(32, Number(w.borderRadius) || 16))}px;
  --cb-width: ${width}px;
  --cb-height: ${height}px;
  --cb-z: ${Math.max(1, Math.min(2147483647, Math.floor(c.zIndex)))};
}`;

    this.root = document.createElement('div');
    this.root.className = `root${w.position === 'bottom-left' ? ' left' : ''}`;

    const title = escapeHtml(w.title || c.name);
    const initial = escapeHtml((w.title || c.name || '?').trim().charAt(0).toUpperCase());
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', `${w.title || c.name} chat`);
    this.panel.innerHTML = `
      <div class="header">
        <div class="avatar">${initial}</div>
        <div class="titles">
          <div class="title">${title}</div>
          ${w.subtitle ? `<div class="subtitle">${escapeHtml(w.subtitle)}</div>` : ''}
        </div>
        <button class="icon-btn" data-action="reset" type="button" aria-label="Start a new conversation" title="New conversation">${icons.refresh}</button>
        <button class="icon-btn" data-action="close" type="button" aria-label="Minimize chat" title="Minimize">${icons.minimize}</button>
      </div>
      <div class="messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="composer">
        <form class="input-row">
          <label class="sr-only" for="cb-input">Message</label>
          <textarea id="cb-input" rows="1"></textarea>
          <button class="send" type="submit" aria-label="Send message">${icons.send}</button>
        </form>
        <div class="footer">
          <span>${w.showBranding ? 'Powered by AI Chatbot Builder' : ''}</span>
          <span class="count"></span>
        </div>
      </div>
      <div class="sr-only" aria-live="assertive"></div>`;

    // Avatar image: only http(s) URLs, set via property (never via HTML).
    if (w.avatarUrl && /^https?:\/\//i.test(w.avatarUrl)) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = w.avatarUrl;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      const avatar = this.panel.querySelector('.avatar')!;
      avatar.textContent = '';
      avatar.appendChild(img);
    }

    this.list = this.panel.querySelector('.messages')!;
    this.input = this.panel.querySelector('textarea')!;
    this.sendBtn = this.panel.querySelector('.send')!;
    this.counter = this.panel.querySelector('.count')!;
    this.live = this.panel.querySelector('.sr-only[aria-live="assertive"]')!;
    this.input.placeholder = c.placeholder || 'Type your message…';
    this.input.maxLength = c.limits.maxMessageChars;

    this.launcher = document.createElement('button');
    this.launcher.type = 'button';
    this.launcher.className = `launcher${w.launcherText ? '' : ' icon-only'}`;
    this.launcher.setAttribute('aria-label', 'Open chat');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.innerHTML = `${icons.chat}${icons.close}${w.launcherText ? `<span class="label">${escapeHtml(w.launcherText)}</span>` : ''}`;

    this.root.append(this.panel, this.launcher);
    this.shadow.append(style, this.root);

    this.bindEvents();
    this.applyTheme();
    this.renderWelcome();
    this.updateComposer();
  }

  private bindEvents(): void {
    this.launcher.addEventListener('click', () => this.toggle());
    this.panel.querySelector('[data-action="close"]')!.addEventListener('click', () => this.close());
    this.panel.querySelector('[data-action="reset"]')!.addEventListener('click', () => this.resetConversation());
    this.panel.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitInput();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submitInput();
      }
    });
    this.input.addEventListener('input', () => {
      this.autoGrow();
      this.updateComposer();
    });
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    this.list.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const chip = target.closest<HTMLButtonElement>('.chip');
      if (chip) void this.sendMessage(chip.dataset.question ?? chip.textContent ?? '');
      if (target.closest('.retry')) void this.retry();
    });
  }

  private applyTheme(): void {
    const theme = this.config.widget.theme;
    let dark = theme === 'dark';
    if (theme === 'auto' && window.matchMedia) {
      if (!this.mql) {
        this.mql = window.matchMedia('(prefers-color-scheme: dark)');
        this.mql.addEventListener?.('change', this.onThemeChange);
      }
      dark = this.mql.matches;
    }
    this.root.classList.toggle('dark', dark);
  }

  private renderWelcome(): void {
    if (this.config.welcomeMessage) {
      this.pushMessage({ id: 'welcome', role: 'assistant', content: this.config.welcomeMessage, status: 'done' }, false);
    }
    this.renderSuggestions();
  }

  private renderSuggestions(): void {
    this.list.querySelector('.suggestions')?.remove();
    const questions = this.config.widget.suggestedQuestions ?? [];
    const hasUserMessage = this.messages.some((m) => m.role === 'user');
    if (!questions.length || hasUserMessage) return;
    const wrap = document.createElement('div');
    wrap.className = 'suggestions';
    for (const q of questions) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = q;
      chip.dataset.question = q;
      wrap.appendChild(chip);
    }
    this.list.appendChild(wrap);
  }

  private pushMessage(msg: ChatMessage, scroll = true): void {
    this.messages.push(msg);
    this.list.querySelector('.suggestions')?.remove();
    const row = document.createElement('div');
    row.className = `msg ${msg.role}${msg.status === 'error' ? ' error' : ''}`;
    row.dataset.id = msg.id;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    row.appendChild(bubble);
    this.list.appendChild(row);
    this.paint(msg);
    if (msg.id === 'welcome') this.renderSuggestions();
    if (scroll) this.scrollToBottom();
  }

  /** Re-renders one message bubble (batched per animation frame while streaming). */
  private paint(msg: ChatMessage): void {
    const row = this.list.querySelector<HTMLDivElement>(`.msg[data-id="${msg.id}"]`);
    if (!row) return;
    row.classList.toggle('error', msg.status === 'error');
    const bubble = row.firstElementChild as HTMLDivElement;
    if (msg.role === 'user') {
      bubble.textContent = msg.content;
    } else if (msg.status === 'streaming' && !msg.content) {
      bubble.innerHTML = '<span class="typing" aria-label="Assistant is typing"><span></span><span></span><span></span></span>';
    } else {
      bubble.innerHTML = renderMarkdown(msg.content);
      if (msg.status === 'error' && this.lastUserMessage) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry';
        retry.textContent = 'Try again';
        bubble.appendChild(retry);
      }
    }
  }

  private schedulePaint(msg: ChatMessage): void {
    if (this.renderScheduled.has(msg.id)) return;
    this.renderScheduled.add(msg.id);
    requestAnimationFrame(() => {
      this.renderScheduled.delete(msg.id);
      this.paint(msg);
      this.scrollToBottom();
    });
  }

  private scrollToBottom(): void {
    this.list.scrollTop = this.list.scrollHeight;
  }

  private autoGrow(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
  }

  private updateComposer(): void {
    const len = this.input.value.length;
    const max = this.config.limits.maxMessageChars;
    this.sendBtn.disabled = this.sending || !this.input.value.trim() || len > max;
    this.counter.textContent = len > max * 0.8 ? `${len}/${max}` : '';
    this.counter.classList.toggle('over', len > max);
  }

  private announce(text: string): void {
    this.live.textContent = text;
  }

  // ── Conversation logic ────────────────────────────────────────────────
  private async submitInput(): Promise<void> {
    const text = this.input.value;
    if (!text.trim() || this.sending) return;
    this.input.value = '';
    this.autoGrow();
    await this.sendMessage(text);
  }

  private async retry(): Promise<void> {
    if (!this.lastUserMessage || this.sending) return;
    const last = this.messages[this.messages.length - 1];
    if (last?.status === 'error') {
      this.messages.pop();
      this.list.querySelector(`.msg[data-id="${last.id}"]`)?.remove();
    }
    await this.requestAnswer(this.lastUserMessage);
  }

  private async requestAnswer(message: string): Promise<void> {
    this.sending = true;
    this.lastUserMessage = message;
    this.updateComposer();
    const reply: ChatMessage = { id: nextId(), role: 'assistant', content: '', status: 'streaming' };
    this.pushMessage(reply);
    this.abort = new AbortController();
    const streaming = this.config.features.streaming && typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';

    try {
      const result = await sendMessage(
        {
          apiBase: this.config.apiBase,
          chatbotId: this.config.publicId,
          visitorId: this.visitorId,
          conversationId: this.conversationId,
          message,
          products: this.config.features.pageProducts ? this.products : undefined,
          pageUrl: window.location.href,
          stream: streaming,
          signal: this.abort.signal,
        },
        {
          onStart: (id) => this.rememberConversation(id),
          onDelta: (text) => {
            reply.content += text;
            this.schedulePaint(reply);
          },
          onReset: () => {
            reply.content = '';
            this.schedulePaint(reply);
          },
        },
      );
      this.rememberConversation(result.conversationId);
      reply.content = result.content;
      reply.status = result.error ? 'error' : 'done';
      this.paint(reply);
      this.announce(result.content.slice(0, 200));
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        this.list.querySelector(`.msg[data-id="${reply.id}"]`)?.remove();
        this.messages = this.messages.filter((m) => m.id !== reply.id);
      } else {
        reply.content = visitorErrorMessage(err);
        reply.status = 'error';
        this.paint(reply);
        if (err instanceof WidgetApiError && err.code === 'CONVERSATION_LIMIT') {
          this.conversationId = null;
          storage.remove(conversationKey(this.config.publicId));
        }
      }
    } finally {
      this.sending = false;
      this.abort = null;
      this.updateComposer();
      this.scrollToBottom();
    }
  }

  private rememberConversation(id: string | undefined): void {
    if (!id || id === this.conversationId) return;
    this.conversationId = id;
    storage.set(conversationKey(this.config.publicId), id);
  }

  /** Restores the visitor's previous conversation the first time the panel opens. */
  private async restoreHistory(): Promise<void> {
    if (this.historyRequested || !this.conversationId) return;
    this.historyRequested = true;
    try {
      const data = await fetchConversation(this.config.apiBase, this.config.publicId, this.visitorId, this.conversationId);
      if (!data.messages.length || this.messages.some((m) => m.role === 'user')) return;
      for (const m of data.messages) {
        this.pushMessage({ id: `h_${m.id}`, role: m.role, content: m.content, status: 'done' }, false);
      }
      this.scrollToBottom();
    } catch (err) {
      if (err instanceof WidgetApiError && err.status === 404) {
        this.conversationId = null;
        storage.remove(conversationKey(this.config.publicId));
      }
    }
  }
}
