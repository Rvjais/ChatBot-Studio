/**
 * AI Chatbot embeddable widget.
 *
 *   <script>window.AIChatbotConfig = { chatbotId: "cb_..." };</script>
 *   <script src="https://YOUR-DOMAIN/widget.js" async></script>
 *
 * Standalone bundle: no dependency on the host page's frameworks or CSS. All UI lives in a
 * Shadow DOM. Only the public chatbot ID is used — no secrets are ever present on the page.
 */
import { ChatWidget } from './components/chat-widget';
import { detectApiBase, resolveConfig } from './config';
import { fetchConfig, WidgetApiError } from './services/api';
import type { PageConfig } from './types';

interface PublicApi {
  open(): void;
  close(): void;
  toggle(): void;
  sendMessage(text: string): Promise<void>;
  setProducts(products: unknown[]): void;
  resetConversation(): void;
  destroy(): void;
  readonly ready: boolean;
}

declare global {
  interface Window {
    AIChatbotConfig?: PageConfig;
    AIChatbot?: PublicApi;
  }
}

const currentScript = document.currentScript as HTMLScriptElement | null;

async function boot(): Promise<void> {
  if (window.AIChatbot?.ready) return; // already initialised (script included twice)
  const pageConfig: PageConfig = { ...(window.AIChatbotConfig ?? {}) };
  const chatbotId = pageConfig.chatbotId ?? currentScript?.dataset.chatbotId;
  if (!chatbotId) {
    console.warn('[AIChatbot] window.AIChatbotConfig.chatbotId is missing — widget not loaded.');
    return;
  }
  const apiBase = detectApiBase(pageConfig, currentScript);

  let widget: ChatWidget;
  try {
    const server = await fetchConfig(apiBase, chatbotId);
    widget = new ChatWidget(resolveConfig(server, pageConfig, apiBase), pageConfig.products ?? []);
  } catch (err) {
    const reason = err instanceof WidgetApiError ? `${err.status} ${err.code}: ${err.message}` : String(err);
    console.warn(`[AIChatbot] Widget disabled (${reason}).`);
    return;
  }

  const mount = () => {
    widget.mount();
    window.AIChatbot = {
      open: () => widget.open(),
      close: () => widget.close(),
      toggle: () => widget.toggle(),
      sendMessage: (text: string) => widget.sendMessage(String(text ?? '')),
      setProducts: (products: unknown[]) => widget.setProducts(products),
      resetConversation: () => widget.resetConversation(),
      destroy: () => {
        widget.destroy();
        delete window.AIChatbot;
      },
      ready: true,
    };
    window.dispatchEvent(new CustomEvent('aichatbot:ready'));
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

void boot();
