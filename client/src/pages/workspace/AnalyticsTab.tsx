import { ChatbotAnalyticsView } from '../../components/analytics/ChatbotAnalyticsView';
import { useWorkspace } from '../../components/workspace/context';

export function AnalyticsTab() {
  const { chatbot } = useWorkspace();
  return <ChatbotAnalyticsView chatbotId={chatbot.id} />;
}
