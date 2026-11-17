import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { BookOpen, CodeXml, ExternalLink, Package, Palette, Rocket, TriangleExclamationPoint } from 'lucide-react';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CopyButton,
  ErrorState,
  InlineCode,
  SegmentedControl,
  Skeleton,
  buttonClasses,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { DomainRestrictions } from '../../components/workspace/embed/DomainRestrictions';
import { SyncKeySection } from '../../components/workspace/embed/SyncKeySection';
import { useAsync } from '../../hooks/useAsync';
import { chatbotsApi } from '../../services/chatbots';
import { formatNumber } from '../../utils/format';

type SnippetKey = 'basic' | 'withProducts' | 'customStyling' | 'javascriptApi' | 'react' | 'nextjs';

const SNIPPETS: { key: SnippetKey; label: string; title: string; language: string }[] = [
  { key: 'basic', label: 'Basic', title: 'Paste before </body>', language: 'html' },
  { key: 'withProducts', label: 'With products', title: 'Pass the products shown on the page', language: 'html' },
  { key: 'customStyling', label: 'Custom styling', title: 'Per-page overrides', language: 'html' },
  { key: 'javascriptApi', label: 'JavaScript API', title: 'Control the widget from your code', language: 'js' },
  { key: 'react', label: 'React', title: 'src/components/ChatbotWidget.jsx', language: 'jsx' },
  { key: 'nextjs', label: 'Next.js', title: 'app/layout.tsx', language: 'tsx' },
];

function DocSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span className="text-brand-600">{icon}</span>
        {title}
      </h4>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-600">{children}</div>
    </section>
  );
}

export function EmbedTab() {
  const { chatbot, updateChatbot, reload } = useWorkspace();
  const location = useLocation();
  const embed = useAsync(() => chatbotsApi.embed(chatbot.id), [chatbot.id]);
  const limits = useAsync(() => chatbotsApi.widgetConfig(chatbot.publicId).then((c) => c.limits), [chatbot.publicId]);
  const [snippet, setSnippet] = useState<SnippetKey>('basic');

  useEffect(() => {
    if (!location.hash || !embed.data) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, embed.data]);

  const maxProducts = limits.data?.maxProducts ?? 100;
  const maxKb = Math.round((limits.data?.maxProductsBytes ?? 65_536) / 1024);
  const current = SNIPPETS.find((s) => s.key === snippet)!;

  return (
    <div className="space-y-6">
      {chatbot.status === 'inactive' && (
        <Callout tone="warning" icon={<TriangleExclamationPoint size={16} />} title="This chatbot is inactive">
          The widget loads on your site but will not answer visitors until you activate it.
        </Callout>
      )}

      <Card>
        <CardHeader
          icon={<CodeXml size={16} />}
          title="Embed code"
          description="Add the widget to any website — no React, framework or build step required."
          actions={
            embed.data && (
              <a href={embed.data.testPageUrl} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'sm')}>
                <ExternalLink size={14} /> Open standalone test page
              </a>
            )
          }
        />
        <CardBody className="space-y-4">
          {embed.loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : embed.error && !embed.data ? (
            <ErrorState error={embed.error} onRetry={embed.reload} compact />
          ) : embed.data ? (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500">Public chatbot ID</span>
                  <code className="font-mono text-xs text-zinc-900">{embed.data.publicId}</code>
                  <CopyButton text={embed.data.publicId} iconOnly variant="ghost" size="xs" label="Copy public ID" />
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500">Script</span>
                  <code className="font-mono text-xs text-zinc-900">{embed.data.widgetUrl}</code>
                </span>
              </div>
              <div className="scrollbar-thin overflow-x-auto">
                <SegmentedControl value={snippet} onChange={setSnippet} options={SNIPPETS.map((s) => ({ value: s.key, label: s.label }))} aria-label="Snippet" />
              </div>
              <CodeBlock title={current.title} language={current.language} code={embed.data.snippets[snippet]} />
              <p className="text-xs text-zinc-500">
                The embed code contains only the public ID — never your AI provider keys or any secret.
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<BookOpen size={16} />} title="Installation guide" />
        <CardBody className="grid gap-8 lg:grid-cols-2">
          <DocSection icon={<Rocket size={16} />} title="Basic installation">
            <p>
              Copy the <strong>Basic</strong> snippet and paste it just before the closing <InlineCode>{'</body>'}</InlineCode> tag on every page where the chat
              should appear. The script loads asynchronously and renders inside a Shadow DOM, so your site's CSS cannot break it (and it cannot break your site).
            </p>
            <p>Save, reload your site and click the chat bubble. Use the standalone test page above to check the widget outside your site.</p>
          </DocSection>

          <DocSection icon={<CodeXml size={16} />} title="Platform notes">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Plain HTML / PHP:</strong> paste the snippet before <InlineCode>{'</body>'}</InlineCode> in your template or footer include.
              </li>
              <li>
                <strong>WordPress:</strong> add it to your theme's <InlineCode>footer.php</InlineCode>, or use a header/footer-scripts plugin and place it in the
                footer section.
              </li>
              <li>
                <strong>Shopify:</strong> Online Store → Themes → Edit code → <InlineCode>layout/theme.liquid</InlineCode>, paste before{' '}
                <InlineCode>{'</body>'}</InlineCode>.
              </li>
              <li>
                <strong>React (Vite / CRA):</strong> copy the <strong>React</strong> snippet into <InlineCode>src/components/ChatbotWidget.jsx</InlineCode> and render{' '}
                <InlineCode>{'<ChatbotWidget />'}</InlineCode> once in your root <InlineCode>App</InlineCode> component.
              </li>
              <li>
                <strong>Next.js:</strong> use the <strong>Next.js</strong> snippet in <InlineCode>app/layout.tsx</InlineCode> (it uses the{' '}
                <InlineCode>next/script</InlineCode> component).
              </li>
            </ul>
          </DocSection>

          <DocSection icon={<Package size={16} />} title="Product JSON integration">
            <p>
              Pass the products visible on a page in <InlineCode>window.AIChatbotConfig.products</InlineCode> (see the <strong>With products</strong> snippet), or
              update them later with <InlineCode>window.AIChatbot.setProducts([...])</InlineCode>.
            </p>
            <p>
              Page products are <strong>unverified browser context</strong>: the bot may describe them, but catalog records you upload or sync always take
              priority, and prices are checked against your data. Limits: up to <strong>{formatNumber(maxProducts)} products</strong> and{' '}
              <strong>{maxKb} KB</strong> per request{limits.data ? '' : ' (platform defaults)'}; extra items are dropped.
            </p>
            <p>
              {chatbot.productSettings.allowBrowserProducts
                ? 'Page-provided products are currently enabled for this chatbot.'
                : 'Page-provided products are currently disabled for this chatbot (Products → Product settings).'}{' '}
              For larger catalogs use the Product Sync API below.
            </p>
          </DocSection>

          <DocSection icon={<Palette size={16} />} title="Custom styling & JavaScript API">
            <p>
              Appearance is managed in the Appearance tab. Individual pages can override it in <InlineCode>window.AIChatbotConfig</InlineCode>:
            </p>
            <ul className="space-y-0.5 rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 ring-1 ring-zinc-200">
              <li>chatbotId: string</li>
              <li>apiBase: string</li>
              <li>theme: "light" | "dark" | "auto"</li>
              <li>position: "bottom-right" | "bottom-left"</li>
              <li>primaryColor: "#hex"</li>
              <li>openOnLoad: boolean</li>
              <li>zIndex: number</li>
              <li>products: Product[]</li>
            </ul>
            <p>
              After loading, <InlineCode>window.AIChatbot</InlineCode> exposes <InlineCode>open()</InlineCode>, <InlineCode>close()</InlineCode>,{' '}
              <InlineCode>toggle()</InlineCode>, <InlineCode>sendMessage(text)</InlineCode>, <InlineCode>setProducts(list)</InlineCode> and{' '}
              <InlineCode>resetConversation()</InlineCode>. Listen for the <InlineCode>aichatbot:ready</InlineCode> event on <InlineCode>window</InlineCode> to know when
              it is available.
            </p>
          </DocSection>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <SyncKeySection chatbot={chatbot} apiBase={embed.data?.apiBase ?? window.location.origin} onChanged={() => void reload()} />
        <DomainRestrictions chatbot={chatbot} onSaved={updateChatbot} />
      </div>
    </div>
  );
}
