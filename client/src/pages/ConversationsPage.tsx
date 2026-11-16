import { ConversationList } from '../components/conversations/ConversationList';
import { PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function ConversationsPage() {
  useDocumentTitle('Conversations');
  return (
    <div>
      <PageHeader title="Conversations" description="Every chat across your chatbots. Open one to read the full history with sources, products and usage." />
      <ConversationList />
    </div>
  );
}
