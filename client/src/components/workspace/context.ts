import { useOutletContext } from 'react-router';
import type { Chatbot } from '../../types/api';

export interface WorkspaceContext {
  chatbot: Chatbot;
  /** Replace the cached chatbot with a server response (keeps `stats`). */
  updateChatbot: (next: Chatbot) => void;
  reload: () => Promise<void>;
  openTestChat: () => void;
}

export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext>();
}
