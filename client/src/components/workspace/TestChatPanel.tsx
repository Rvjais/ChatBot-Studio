import { Markdown } from '../ui/Markdown';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Bug, ChevronDown, Package, RotateCcw, SendHorizontal, Square } from 'lucide-react';
import { streamPreviewChat } from '../../services/previewChat';
import type { ChatDebug, Chatbot } from '../../types/api';
import { cn } from '../../utils/cn';
import { getErrorCode, getErrorMessage, isAbortError } from '../../utils/errors';
import { formatCost, formatMs, formatNumber } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Field';
import { Drawer } from '../ui/Modal';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: { code: string; message?: string };
  debug?: ChatDebug;
}

let seq = 0;
const nextId = () => `m${++seq}`;

function DebugPanel({ debug }: { debug: ChatDebug }) {
  const [open, setOpen] = useState(false);
  const usage = debug.usage;
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800">
        <Bug size={12} />
        {debug.provider} · {debug.model} · {formatMs(debug.latencyMs)}
        {usage?.totalTokens !== undefined || usage?.inputTokens !== undefined ? ` · ${formatNumber((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0))} tokens` : ''}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-zinc-400">Provider / model</dt>
            <dd className="truncate font-mono">
              {debug.provider} / {debug.model}
            </dd>
            <dt className="text-zinc-400">Latency</dt>
            <dd>{formatMs(debug.latencyMs)}</dd>
            <dt className="text-zinc-400">Tokens (in / out)</dt>
            <dd>{usage ? `${formatNumber(usage.inputTokens ?? 0)} / ${formatNumber(usage.outputTokens ?? 0)}` : 'Not reported'}</dd>
            <dt className="text-zinc-400">Cost</dt>
            <dd>{typeof debug.costUsd === 'number' ? formatCost(debug.costUsd) : 'No pricing data'}</dd>
            <dt className="text-zinc-400">Retrieval</dt>
            <dd>{debug.retrievalMode}</dd>
          </dl>
          {debug.retrievalWarning && <p className="text-amber-700">{debug.retrievalWarning}</p>}
          <div>
            <p className="font-medium text-zinc-700">Knowledge sources ({debug.knowledge.length})</p>
            {debug.knowledge.length ? (
              <ul className="mt-1 space-y-0.5">
                {debug.knowledge.map((k, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate">{k.fileName ?? 'Unknown file'}</span>
                    {k.page !== undefined && k.page !== null && <span className="text-zinc-400">p.{k.page}</span>}
                    {typeof k.similarity === 'number' && <span className="tabular text-zinc-400">sim {k.similarity.toFixed(3)}</span>}
                    {k.via.map((v) => (
                      <Badge key={v} tone={v === 'vector' ? 'violet' : 'blue'}>
                        {v}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-400">None used</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-medium text-zinc-700">Verified products</p>
              <p className="break-words">{debug.verifiedProducts.length ? debug.verifiedProducts.join(', ') : '—'}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-700">Page products</p>
              <p className="break-words">{debug.pageProducts.length ? debug.pageProducts.join(', ') : '—'}</p>
            </div>
          </div>
          {debug.priceCheck && (
            <p className={debug.priceCheck.passed ? 'text-emerald-700' : 'text-amber-700'}>
              {debug.priceCheck.passed
                ? 'Price check passed — every amount matches the supplied data.'
                : `Price check: unverified amounts ${debug.priceCheck.unverifiedAmounts.join(', ')}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Dashboard test chat: streams POST /preview-chat over SSE and shows per-answer debug info. */
export function TestChatPanel({ chatbot, open, onClose }: { chatbot: Chatbot; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [productsJson, setProductsJson] = useState('');
  const [productsError, setProductsError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // A different chatbot means a different conversation.
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
  }, [chatbot.id]);

  const updateMessage = (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));

  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setSending(false);
    inputRef.current?.focus();
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    let products: unknown[] | undefined;
    setProductsError(null);
    if (showProducts && productsJson.trim()) {
      try {
        const parsed: unknown = JSON.parse(productsJson);
        if (!Array.isArray(parsed)) throw new Error('Page products must be a JSON array');
        products = parsed;
      } catch (err) {
        setProductsError(err instanceof Error ? err.message : 'Invalid JSON');
        return;
      }
    }

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text };
    const botId = nextId();
    setMessages((list) => [...list, userMsg, { id: botId, role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamPreviewChat(
        chatbot.id,
        { message: text, conversationId, products },
        {
          onStart: ({ conversationId: id }) => setConversationId(id),
          onDelta: (t) => updateMessage(botId, (m) => ({ content: m.content + t })),
          onReset: () => updateMessage(botId, { content: '' }),
          onError: (err) => updateMessage(botId, { error: { code: err.code, message: err.message } }),
          onDone: (done) => {
            setConversationId(done.conversationId);
            updateMessage(botId, (m) => ({
              content: done.content,
              streaming: false,
              debug: done.debug,
              error: done.error ? { code: done.error.code, message: done.error.message ?? m.error?.message } : m.error,
            }));
          },
        },
        controller.signal,
      );
      updateMessage(botId, (m) => ({ streaming: false, content: m.content || (m.error ? '' : 'No response received.') }));
    } catch (err) {
      if (isAbortError(err)) {
        updateMessage(botId, (m) => ({ streaming: false, content: m.content || 'Stopped.' }));
      } else {
        updateMessage(botId, { streaming: false, error: { code: getErrorCode(err) ?? 'REQUEST_FAILED', message: getErrorMessage(err) } });
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const suggestions = chatbot.widget.suggestedQuestions ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={`Test chat · ${chatbot.name}`}
      description={
        <span className="flex flex-wrap items-center gap-x-2">
          {chatbot.ai.provider} · <span className="font-mono text-xs">{chatbot.ai.model}</span>
          {conversationId && <span className="font-mono text-[11px] text-zinc-400">{conversationId}</span>}
        </span>
      }
      actions={
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={newConversation} disabled={!messages.length && !conversationId}>
          New conversation
        </Button>
      }
      bodyClassName="bg-zinc-50/60"
      footer={
        <div className="space-y-2 p-4">
          {showProducts && (
            <Textarea
              rows={4}
              value={productsJson}
              onChange={(e) => setProductsJson(e.target.value)}
              placeholder='[{ "id": "P001", "name": "Wireless Headphones", "price": 2499, "currency": "INR" }]'
              className="font-mono text-xs"
              error={productsError ?? undefined}
              hint="Simulates products passed by the page (window.AIChatbotConfig.products). Sent with every message."
            />
          )}
          <form onSubmit={send} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={chatbot.placeholder || 'Type your message…'}
              aria-label="Message"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            />
            {sending ? (
              <Button variant="secondary" iconOnly size="lg" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                <Square size={16} />
              </Button>
            ) : (
              <Button type="submit" variant="primary" iconOnly size="lg" aria-label="Send" disabled={!input.trim()}>
                <SendHorizontal size={18} />
              </Button>
            )}
          </form>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-zinc-800" onClick={() => setShowProducts((s) => !s)}>
              <Package size={13} /> {showProducts ? 'Hide' : 'Simulate'} page products
            </button>
            <span>Test chats are stored as “preview” conversations and count toward token usage.</span>
          </div>
        </div>
      }
    >
      <div ref={listRef} className="h-full overflow-y-auto px-5 py-5">
        {chatbot.status === 'inactive' && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            This chatbot is inactive — test chats still work here, but the embedded widget will not answer visitors.
          </p>
        )}
        <div className="space-y-4">
          {chatbot.welcomeMessage && (
            <div className="flex">
              <div className="chat-text max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-zinc-800 shadow-xs ring-1 ring-zinc-200">
                {chatbot.welcomeMessage}
              </div>
            </div>
          )}
          {messages.length === 0 && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-brand-400 hover:bg-brand-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="chat-text max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-sm text-white">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col items-start">
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm shadow-xs ring-1',
                    m.error ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-white text-zinc-800 ring-zinc-200',
                  )}
                >
                  {(m.content && <Markdown text={m.content} />) ||
                    (m.streaming ? (
                      <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
                      </span>
                    ) : null)}
                  {m.streaming && m.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400 align-text-bottom" />}
                </div>
                {m.error && (
                  <div className="mt-1.5 max-w-[85%] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
                    <span className="font-mono font-semibold">{m.error.code}</span>
                    {m.error.message && <span> — {m.error.message}</span>}
                  </div>
                )}
                {m.debug && <DebugPanel debug={m.debug} />}
              </div>
            ),
          )}
        </div>
      </div>
    </Drawer>
  );
}
