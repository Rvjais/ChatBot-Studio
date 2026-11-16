import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Clock, LoaderCircle } from 'lucide-react';
import type { ProcessingStatus } from '../../types/api';
import { Badge } from '../ui/Badge';

const MAP: Record<ProcessingStatus, { tone: 'gray' | 'blue' | 'green' | 'red'; label: string; icon: ReactNode }> = {
  pending: { tone: 'gray', label: 'Pending', icon: <Clock size={12} /> },
  processing: { tone: 'blue', label: 'Processing', icon: <LoaderCircle size={12} className="animate-spin" /> },
  completed: { tone: 'green', label: 'Completed', icon: <CircleCheck size={12} /> },
  failed: { tone: 'red', label: 'Failed', icon: <CircleX size={12} /> },
};

export function FileStatusBadge({ status }: { status: ProcessingStatus }) {
  const s = MAP[status] ?? MAP.pending;
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export const KNOWLEDGE_EXTENSIONS = ['pdf', 'txt', 'md', 'docx', 'csv', 'json', 'xlsx'];

export function fileTypeLabel(fileType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && KNOWLEDGE_EXTENSIONS.includes(ext)) return ext.toUpperCase();
  return (fileType || 'file').toUpperCase();
}
