import { ConversationList } from '../../components/conversations/ConversationList';
import { useWorkspace } from '../../components/workspace/context';

export function ConversationsTab() {
  const { chatbot } = useWorkspace();
  return <ConversationList chatbotId={chatbot.id} />;
}
