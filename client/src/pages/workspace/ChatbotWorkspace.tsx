import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import {
  BookOpen,
  Bot,
  ChartColumn,
  ChevronLeft,
  CodeXml,
  Copy,
  MessagesSquare,
  Package,
  Palette,
  Play,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Trash,
} from 'lucide-react';
import { ChatbotAvatar } from '../../components/chatbots/ChatbotAvatar';
import { DeleteChatbotDialog, DuplicateChatbotModal } from '../../components/chatbots/ChatbotDialogs';
import { StatusToggle } from '../../components/chatbots/StatusToggle';
import { Button, CopyButton, ErrorState, NavTabs, Skeleton } from '../../components/ui';
import { ActionMenu } from '../../components/ui/Menu';
import type { WorkspaceContext } from '../../components/workspace/context';
import { TestChatPanel } from '../../components/workspace/TestChatPanel';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { providerLabel } from '../../hooks/useProviders';
import { chatbotsApi } from '../../services/chatbots';
import type { Chatbot } from '../../types/api';

export function ChatbotWorkspace() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const state = useAsync(() => chatbotsApi.get(id), [id]);
  const chatbot = state.data;
  const [testOpen, setTestOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useDocumentTitle(chatbot?.name ?? 'Chatbot');

  const updateChatbot = useCallback(
    (next: Chatbot) => state.setData((prev) => ({ ...next, stats: next.stats ?? prev?.stats })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const tabs = useMemo(
    () => [
      { to: `/chatbots/${id}`, label: 'General', icon: <SlidersHorizontal size={15} />, end: true },
      { to: `/chatbots/${id}/ai`, label: 'AI Settings', icon: <Sparkles size={15} /> },
      { to: `/chatbots/${id}/instructions`, label: 'Instructions', icon: <ScrollText size={15} /> },
      { to: `/chatbots/${id}/knowledge`, label: 'Knowledge Base', icon: <BookOpen size={15} /> },
      { to: `/chatbots/${id}/products`, label: 'Products', icon: <Package size={15} /> },
      { to: `/chatbots/${id}/appearance`, label: 'Appearance', icon: <Palette size={15} /> },
      { to: `/chatbots/${id}/embed`, label: 'Embed', icon: <CodeXml size={15} /> },
      { to: `/chatbots/${id}/conversations`, label: 'Conversations', icon: <MessagesSquare size={15} /> },
      { to: `/chatbots/${id}/analytics`, label: 'Analytics', icon: <ChartColumn size={15} /> },
    ],
    [id],
  );

  if (state.loading) {
    return (
      <div>
        <Skeleton className="mb-6 h-4 w-28" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="mt-8 h-10 w-full" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!chatbot) {
    return (
      <div>
        <Link to="/chatbots" className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
          <ChevronLeft size={16} /> My chatbots
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white">
          <ErrorState error={state.error} onRetry={state.reload} title="Could not open this chatbot" />
        </div>
      </div>
    );
  }

  const context: WorkspaceContext = { chatbot, updateChatbot, reload: state.reload, openTestChat: () => setTestOpen(true) };

  return (
    <div>
      <Link to="/chatbots" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        <ChevronLeft size={16} /> My chatbots
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ChatbotAvatar name={chatbot.name} color={chatbot.widget.primaryColor} avatarUrl={chatbot.widget.avatarUrl} size={48} className="rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{chatbot.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <span className="text-zinc-400">Public ID</span>
                <code className="font-mono text-xs text-zinc-700">{chatbot.publicId}</code>
                <CopyButton text={chatbot.publicId} iconOnly variant="ghost" size="xs" label="Copy public ID" />
              </span>
              <span className="hidden text-zinc-300 sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Bot size={14} className="text-zinc-400" />
                {providerLabel(chatbot.ai.provider)} · <span className="font-mono text-xs">{chatbot.ai.model}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 shadow-xs">
            <StatusToggle chatbot={chatbot} onChange={updateChatbot} />
          </div>
          <Button variant="primary" icon={<Play size={15} />} onClick={() => setTestOpen(true)}>
            Test chat
          </Button>
          <ActionMenu
            items={[
              { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => setDuplicateOpen(true) },
              { label: 'Delete chatbot', icon: <Trash size={15} />, danger: true, onSelect: () => setDeleteOpen(true) },
            ]}
          />
        </div>
      </div>

      <div className="mt-6 border-b border-zinc-200">
        <NavTabs tabs={tabs} />
      </div>

      <div className="pt-6">
        <Outlet context={context} />
      </div>

      <TestChatPanel chatbot={chatbot} open={testOpen} onClose={() => setTestOpen(false)} />
      <DuplicateChatbotModal
        chatbot={chatbot}
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        onDuplicated={(copy) => navigate(`/chatbots/${copy.id}`)}
      />
      <DeleteChatbotDialog chatbot={chatbot} open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={() => navigate('/chatbots', { replace: true })} />
    </div>
  );
}
