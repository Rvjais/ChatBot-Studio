import { Link, useNavigate } from 'react-router';
import { BookOpen, Copy, MessagesSquare, Package, Trash, ArrowUpRight } from 'lucide-react';
import { providerLabel } from '../../hooks/useProviders';
import type { Chatbot } from '../../types/api';
import { formatNumber, formatRelative } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { ActionMenu } from '../ui/Menu';
import { ChatbotAvatar } from './ChatbotAvatar';
import { StatusToggle } from './StatusToggle';

interface Props {
  chatbot: Chatbot;
  onChange: (c: Chatbot) => void;
  onDuplicate: (c: Chatbot) => void;
  onDelete: (c: Chatbot) => void;
}

function KeyBadge({ chatbot }: { chatbot: Chatbot }) {
  const configured = chatbot.ai.hasApiKey || (chatbot.ai.provider === 'custom' && Boolean(chatbot.ai.baseUrl));
  if (!configured) return <Badge tone="amber" dot>No API key</Badge>;
  if (chatbot.ai.lastTest?.status === 'failed') return <Badge tone="red" dot>Last test failed</Badge>;
  if (chatbot.ai.lastTest?.status === 'success') return <Badge tone="green" dot>Connected</Badge>;
  return <Badge tone="gray" dot>Not tested</Badge>;
}

export function ChatbotCard({ chatbot, onChange, onDuplicate, onDelete }: Props) {
  const navigate = useNavigate();
  const stats = chatbot.stats;
  return (
    <div className="group flex flex-col rounded-xl border border-zinc-200 bg-white shadow-card transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3 p-5 pb-3">
        <ChatbotAvatar name={chatbot.name} color={chatbot.widget.primaryColor} avatarUrl={chatbot.widget.avatarUrl} />
        <div className="min-w-0 flex-1">
          <Link to={`/chatbots/${chatbot.id}`} className="block truncate font-semibold text-zinc-900 hover:text-brand-700">
            {chatbot.name}
          </Link>
          <p className="truncate font-mono text-xs text-zinc-400">{chatbot.identifier}</p>
        </div>
        <ActionMenu
          items={[
            { label: 'Open workspace', icon: <ArrowUpRight size={15} />, onSelect: () => navigate(`/chatbots/${chatbot.id}`) },
            { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => onDuplicate(chatbot) },
            { label: 'Delete', icon: <Trash size={15} />, danger: true, onSelect: () => onDelete(chatbot) },
          ]}
        />
      </div>
      <p className="line-clamp-2 min-h-10 px-5 text-sm leading-5 text-zinc-500">{chatbot.description || 'No description'}</p>
      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        <Badge tone="brand">{providerLabel(chatbot.ai.provider)}</Badge>
        <Badge tone="gray" className="max-w-[180px] font-mono" title={chatbot.ai.model}>
          {chatbot.ai.model}
        </Badge>
        <KeyBadge chatbot={chatbot} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5" title="Widget conversations">
          <MessagesSquare size={14} className="text-zinc-400" />
          <span className="tabular font-medium text-zinc-800">{formatNumber(stats?.conversations ?? 0)}</span>
        </span>
        <span className="flex items-center gap-1.5" title="Knowledge files">
          <BookOpen size={14} className="text-zinc-400" />
          <span className="tabular font-medium text-zinc-800">{formatNumber(stats?.knowledgeFiles ?? 0)}</span>
        </span>
        <span className="flex items-center gap-1.5" title="Products">
          <Package size={14} className="text-zinc-400" />
          <span className="tabular font-medium text-zinc-800">{formatNumber(stats?.products ?? 0)}</span>
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 rounded-b-xl border-t border-zinc-100 bg-zinc-50/60 px-5 py-2.5">
        <StatusToggle chatbot={chatbot} onChange={onChange} />
        <span className="text-xs text-zinc-400" title="Last visitor activity">
          {stats?.lastActivityAt ? `Active ${formatRelative(stats.lastActivityAt)}` : `Updated ${formatRelative(chatbot.updatedAt)}`}
        </span>
      </div>
    </div>
  );
}

export function ChatbotRow({ chatbot, onChange, onDuplicate, onDelete }: Props) {
  const navigate = useNavigate();
  const stats = chatbot.stats;
  return (
    <tr className="transition-colors hover:bg-zinc-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <ChatbotAvatar name={chatbot.name} color={chatbot.widget.primaryColor} avatarUrl={chatbot.widget.avatarUrl} size={32} />
          <div className="min-w-0">
            <Link to={`/chatbots/${chatbot.id}`} className="block truncate font-medium text-zinc-900 hover:text-brand-700">
              {chatbot.name}
            </Link>
            <p className="max-w-xs truncate text-xs text-zinc-500">{chatbot.description || 'No description'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-zinc-800">{providerLabel(chatbot.ai.provider)}</p>
        <p className="max-w-[200px] truncate font-mono text-xs text-zinc-500">{chatbot.ai.model}</p>
      </td>
      <td className="px-4 py-3">
        <KeyBadge chatbot={chatbot} />
      </td>
      <td className="tabular px-4 py-3 text-sm text-zinc-700">{formatNumber(stats?.conversations ?? 0)}</td>
      <td className="tabular px-4 py-3 text-sm text-zinc-700">
        {formatNumber(stats?.knowledgeFiles ?? 0)} / {formatNumber(stats?.products ?? 0)}
      </td>
      <td className="px-4 py-3">
        <StatusToggle chatbot={chatbot} onChange={onChange} />
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">{formatRelative(chatbot.updatedAt)}</td>
      <td className="px-4 py-3 text-right">
        <ActionMenu
          items={[
            { label: 'Open workspace', icon: <ArrowUpRight size={15} />, onSelect: () => navigate(`/chatbots/${chatbot.id}`) },
            { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => onDuplicate(chatbot) },
            { label: 'Delete', icon: <Trash size={15} />, danger: true, onSelect: () => onDelete(chatbot) },
          ]}
        />
      </td>
    </tr>
  );
}
