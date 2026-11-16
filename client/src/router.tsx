import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ApiConfigPage } from './pages/ApiConfigPage';
import { ChatbotsPage } from './pages/ChatbotsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { NotFoundPage, RouteErrorPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { AiSettingsTab } from './pages/workspace/AiSettingsTab';
import { AnalyticsTab } from './pages/workspace/AnalyticsTab';
import { AppearanceTab } from './pages/workspace/AppearanceTab';
import { ChatbotWorkspace } from './pages/workspace/ChatbotWorkspace';
import { ConversationsTab } from './pages/workspace/ConversationsTab';
import { EmbedTab } from './pages/workspace/EmbedTab';
import { GeneralTab } from './pages/workspace/GeneralTab';
import { InstructionsTab } from './pages/workspace/InstructionsTab';
import { KnowledgeTab } from './pages/workspace/KnowledgeTab';
import { ProductsTab } from './pages/workspace/ProductsTab';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'chatbots', element: <ChatbotsPage /> },
              {
                path: 'chatbots/:id',
                element: <ChatbotWorkspace />,
                children: [
                  { index: true, element: <GeneralTab /> },
                  { path: 'general', element: <Navigate to=".." replace /> },
                  { path: 'ai', element: <AiSettingsTab /> },
                  { path: 'instructions', element: <InstructionsTab /> },
                  { path: 'knowledge', element: <KnowledgeTab /> },
                  { path: 'products', element: <ProductsTab /> },
                  { path: 'appearance', element: <AppearanceTab /> },
                  { path: 'embed', element: <EmbedTab /> },
                  { path: 'conversations', element: <ConversationsTab /> },
                  { path: 'analytics', element: <AnalyticsTab /> },
                ],
              },
              { path: 'conversations', element: <ConversationsPage /> },
              { path: 'knowledge', element: <KnowledgePage /> },
              { path: 'analytics', element: <AnalyticsPage /> },
              { path: 'api-config', element: <ApiConfigPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
