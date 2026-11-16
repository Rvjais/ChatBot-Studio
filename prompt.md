# MASTER DEVELOPMENT PROMPT: MULTI-TENANT AI CHATBOT BUILDER SAAS

## 1. PROJECT OVERVIEW

Build a complete, production-ready, multi-tenant AI chatbot builder platform.

The platform should allow an administrator to create and manage multiple independent AI chatbots from a centralized dashboard.

Each chatbot must have its own:
- Name and description.
- System prompt and personality.
- AI model configuration.
- AI provider and API key configuration.
- Knowledge base.
- Uploaded documents and files.
- Product data (if applicable).
- Appearance and branding settings.
- Website embedding configuration.
- Conversation history and analytics.

The primary purpose is to allow website owners, e-commerce businesses, agencies, and developers to create customized AI chatbots and embed them into any website using a simple JavaScript embed code.

The application must be fully functional, not just a UI prototype.

## 2. TECHNOLOGY STACK

Use the following stack unless an existing project already has an established architecture that should be preserved.

### Frontend
- React.js
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Axios
- Zustand or Context API for state management
- Lucide React for icons

### Backend
- Node.js
- Express.js
- TypeScript
- MongoDB
- Mongoose
- JWT authentication
- bcrypt for password hashing

### AI Integration
Create a provider-independent AI integration architecture supporting:

1. OpenAI
2. DeepSeek
3. Anthropic Claude
4. Google Gemini
5. OpenRouter
6. Custom OpenAI-compatible APIs

The system must support different models within each provider.

Do not hardcode a single AI provider into the application.

Create a modular AI provider adapter system so additional providers can be integrated without rewriting the chatbot engine.

### File Processing
Support:
- PDF
- TXT
- DOCX
- CSV
- JSON
- XLSX

Use appropriate document parsers and processing libraries.

For large knowledge bases, implement chunking, embeddings, and vector retrieval using a suitable vector database or storage solution.

## 3. AUTHENTICATION AND DASHBOARD

Create a secure authentication system.

Features:
- User registration.
- Login.
- Logout.
- Password hashing.
- JWT-based authentication.
- Protected dashboard routes.
- User-specific chatbot management.

Each user must only be able to access their own chatbots and associated data.

Implement strict ownership checks on every relevant backend endpoint.

## 4. MAIN DASHBOARD

Create a modern, responsive dashboard.

The dashboard should contain:

### Overview
Display:
- Total chatbots.
- Total conversations.
- Total messages.
- Active chatbots.
- AI provider configuration status.
- Recent chatbot activity.

### Chatbot Management

Users should be able to:
- Create unlimited chatbots, subject to configurable platform limits.
- Edit existing chatbots.
- Delete chatbots.
- Duplicate chatbots.
- Activate or deactivate chatbots.
- Search and filter chatbots.

Each chatbot should have an individual configuration page.

## 5. CHATBOT CONFIGURATION

When creating a chatbot, provide the following configuration options.

### General Settings
- Chatbot name.
- Description.
- Chatbot identifier.
- Welcome message.
- Placeholder message.
- Language.
- Default response when information is unavailable.

### System Prompt Configuration

Provide a large text editor where users can define the chatbot's system prompt.

Example:

"You are an intelligent customer support assistant for an e-commerce store. Answer questions about products, pricing, availability, shipping, and returns. Always use the provided product information. Never invent prices or product specifications."

The system prompt must be independently configurable for every chatbot.

The user must be able to update the prompt without affecting other chatbots.

### Personality Settings

Provide optional settings for:
- Professional.
- Friendly.
- Casual.
- Technical.
- Concise.
- Detailed.

Allow custom instructions as well.

### AI Model Settings

Allow users to select:

- AI provider.
- Model.
- API key.
- Temperature.
- Maximum output tokens.
- Top P, if supported.
- Other provider-specific generation parameters where applicable.

The user must be able to configure a different AI provider and model for every chatbot.

API keys must be encrypted at rest using authenticated encryption, never exposed through frontend API responses, and never included in public embed configuration.

Provide a test connection feature to verify API credentials.

Support custom API base URLs for compatible providers.

Never assume all providers support identical parameters or API formats. Handle provider-specific differences through adapters.

## 6. KNOWLEDGE BASE MANAGEMENT

Every chatbot must have its own isolated knowledge base.

Provide a dedicated Knowledge Base section.

Users should be able to upload multiple files to a chatbot.

Supported formats:
- PDF
- TXT
- DOCX
- CSV
- JSON
- XLSX

### Upload Workflow

When a file is uploaded:

1. Validate the file type and size.
2. Store the file securely.
3. Extract its contents.
4. Normalize the extracted text.
5. Divide the content into manageable chunks.
6. Generate embeddings where appropriate.
7. Store chunks and their metadata.
8. Associate everything with the correct chatbot.
9. Make the processed content available to the chatbot.

Display:
- File name.
- File type.
- Upload date.
- Processing status.
- Number of chunks.
- Delete option.
- Reprocessing option.

Processing statuses:
- Pending.
- Processing.
- Completed.
- Failed.

### Retrieval-Augmented Generation (RAG)

Implement a retrieval system.

When a user asks a question:

1. Convert the question into an embedding.
2. Search the chatbot's knowledge base for relevant information.
3. Retrieve the most relevant chunks.
4. Add the retrieved information to the AI context.
5. Generate an answer using the configured model.

Important:
- Never mix knowledge between different chatbots.
- Never retrieve another user's documents.
- Use chatbot-specific filtering for every retrieval operation.
- Avoid sending the entire knowledge base with every request.
- Include source information internally so answers can be traced to documents.

If relevant information cannot be found, the chatbot should communicate that it does not have sufficient information instead of fabricating an answer.

## 7. TWO PRODUCT DATA INPUT METHODS

This is a particularly important requirement.

The platform must support TWO independent ways of supplying product information to a chatbot.

Both methods must work together if the user chooses to use them.

### METHOD A: DASHBOARD FILE UPLOAD

A user should be able to upload a JSON, CSV, or Excel file containing product information directly from the chatbot dashboard.

Example product JSON:

[
  {
    "id": "P001",
    "name": "Wireless Headphones",
    "price": 2499,
    "currency": "INR",
    "description": "Bluetooth wireless headphones",
    "availability": "In Stock",
    "category": "Electronics",
    "url": "https://example.com/headphones"
  },
  {
    "id": "P002",
    "name": "Mechanical Keyboard",
    "price": 3499,
    "currency": "INR",
    "description": "RGB mechanical keyboard",
    "availability": "In Stock",
    "category": "Accessories",
    "url": "https://example.com/keyboard"
  }
]

The system must:
- Parse uploaded product files.
- Validate product records.
- Store structured product data.
- Associate products with their chatbot.
- Support adding, updating, and deleting products.
- Allow searching products.
- Make the product information available to the AI chatbot.

For structured product data, prioritize exact database queries over semantic retrieval whenever possible.

### METHOD B: PRODUCT DATA THROUGH EMBED CONFIGURATION

Allow website owners to provide product information through the chatbot's embedding integration.

The generated embed integration must support supplying a JSON product dataset.

Example:

<script>
  window.AIChatbotConfig = {
    chatbotId: "YOUR_PUBLIC_CHATBOT_ID",

    products: [
      {
        id: "P001",
        name: "Wireless Headphones",
        price: 2499,
        currency: "INR",
        description: "Bluetooth wireless headphones",
        availability: "In Stock"
      }
    ]
  };
</script>

<script
  src="https://YOUR-DOMAIN.com/widget.js"
  async>
</script>

The widget should be able to use the supplied product information when answering customer questions.

IMPORTANT IMPLEMENTATION REQUIREMENTS:

- Never expose private AI API keys through this configuration.
- Never expose database credentials or internal secrets.
- Validate all incoming product data.
- Set configurable limits for the size and number of supplied products.
- Do not trust browser-supplied prices for authoritative transactions.
- Clearly distinguish browser-provided context from server-verified product information.

For larger datasets, provide a secure backend ingestion or synchronization endpoint instead of sending thousands of products through the browser.

### Product Question Answering

The chatbot must understand questions such as:

- What is the price of Wireless Headphones?
- Do you have any mechanical keyboards?
- Which product costs less than ₹3,000?
- Is product P001 available?
- Tell me about your headphones.
- Show me products in the electronics category.

The system should retrieve relevant product records and supply them to the AI model.

CRITICAL RULE:

Product prices, availability, product IDs, and other structured fields must come from actual product records.

Never allow the AI model to invent or modify product prices.

For price-sensitive questions, retrieve the relevant product record directly and use that record as the source of truth.

## 8. EMBEDDABLE CHATBOT WIDGET

Create a standalone JavaScript chatbot widget that can be embedded into ANY website.

It must work on:
- React websites.
- WordPress websites.
- Shopify websites.
- HTML websites.
- PHP websites.
- Next.js websites.
- Other websites that support JavaScript.

### Embed Code Generator

Inside the dashboard, provide a dedicated Embed section for each chatbot.

Generate a simple installation snippet.

Example:

<script>
  window.AIChatbotConfig = {
    chatbotId: "PUBLIC_CHATBOT_ID",
    theme: "light"
  };
</script>

<script
  src="https://YOUR-DOMAIN.com/widget.js"
  async>
</script>

Provide options to copy the embed code.

Also provide documentation for:
- Basic installation.
- Product JSON integration.
- Custom styling.
- Website domain restrictions.

### Widget Design

The chatbot widget should contain:

- Floating chat button.
- Expandable chat window.
- Header with chatbot name.
- Welcome message.
- Message input.
- Send button.
- User messages.
- AI messages.
- Loading indicator.
- Error handling.
- Conversation history during the session.
- Mobile-responsive layout.

### Customization

Allow dashboard users to customize:
- Primary color.
- Secondary color.
- Chat button position.
- Widget title.
- Welcome message.
- Avatar or logo.
- Header background.
- Border radius.
- Light/dark theme.
- Widget size.

### Widget Architecture

Build the widget independently from the React dashboard.

Prefer a standalone JavaScript bundle or Web Component.

Avoid depending on the host website's React installation, CSS framework, or global styles.

Use Shadow DOM or equivalent CSS isolation to prevent style conflicts.

The widget must communicate with the backend through secure HTTPS API requests.

Generate unique public chatbot identifiers.

Implement allowed-domain restrictions as an optional security setting.

## 9. CONVERSATION ENGINE

Create a centralized chatbot conversation engine.

Every incoming message should follow this workflow:

1. Receive chatbot ID and message.
2. Validate the chatbot ID.
3. Check chatbot status.
4. Validate allowed origin if domain restrictions are enabled.
5. Load chatbot configuration.
6. Load its configured AI provider and model.
7. Load the system prompt.
8. Retrieve relevant knowledge-base information.
9. Retrieve relevant structured product data.
10. Combine all relevant context.
11. Send the request to the configured AI provider.
12. Return the generated answer.
13. Store conversation and message records.

Maintain conversation context using conversation IDs.

Each visitor should receive an independent conversation session.

Implement reasonable context-window management so very long conversations do not exceed model limits.

### Context Priority

The system must prioritize information in this order:

1. System instructions and safety rules.
2. Verified structured product information.
3. Relevant knowledge-base information.
4. Previous conversation context.
5. General model knowledge, where appropriate.

Never allow uploaded documents, product descriptions, or customer messages to override the system prompt or security rules.

## 10. AI PROVIDER ARCHITECTURE

Build a provider abstraction layer.

Suggested structure:

server/
  services/
    ai/
      providers/
        openai.provider.ts
        deepseek.provider.ts
        anthropic.provider.ts
        gemini.provider.ts
        openrouter.provider.ts
        custom.provider.ts

      ai-provider.interface.ts
      ai-provider.factory.ts
      ai.service.ts

Each provider should implement a common interface.

Support:
- Text generation.
- Streaming responses where supported.
- Model selection.
- Usage information.
- Provider-specific error handling.
- Timeout handling.
- Retry policies.

Create a model configuration system so new models can be added without changing the chatbot engine.

OpenRouter should allow access to compatible models through its API.

Custom providers should support configurable API endpoints, authentication headers, and model identifiers.

Never hardcode provider API keys.

## 11. CONVERSATION MANAGEMENT

Inside the dashboard, provide a Conversations section.

Display:
- All conversations.
- Chatbot associated with each conversation.
- Conversation start date.
- Last message date.
- Message count.
- Visitor session identifier.

Allow users to:
- Open a conversation.
- View complete message history.
- Search conversations.
- Filter by chatbot.
- Delete conversations.

Keep conversation data isolated between users.

## 12. ANALYTICS

Provide basic analytics for every chatbot.

Display:
- Total conversations.
- Total messages.
- Daily conversation count.
- Messages per conversation.
- Most frequently asked questions.
- AI provider usage.
- Token consumption where available.
- Estimated API usage cost where pricing information is available.

Do not fabricate usage or cost metrics.

Store actual provider usage information whenever returned by the API.

## 13. DATABASE DESIGN

Create appropriate MongoDB models.

Suggested models:

### User
- name
- email
- passwordHash
- createdAt
- updatedAt

### Chatbot
- ownerId
- name
- description
- publicId
- systemPrompt
- personality
- welcomeMessage
- fallbackMessage
- provider
- model
- encryptedApiKey
- generationSettings
- widgetSettings
- allowedDomains
- status
- createdAt
- updatedAt

### KnowledgeFile
- ownerId
- chatbotId
- fileName
- fileType
- storagePath
- processingStatus
- chunkCount
- createdAt

### KnowledgeChunk
- ownerId
- chatbotId
- fileId
- content
- embedding
- metadata

### Product
- ownerId
- chatbotId
- productId
- name
- description
- price
- currency
- availability
- category
- productUrl
- additionalFields

### Conversation
- ownerId
- chatbotId
- conversationId
- visitorId
- createdAt
- updatedAt

### Message
- conversationId
- chatbotId
- role
- content
- timestamp
- tokenUsage
- metadata

Create appropriate indexes for frequently queried fields.

Use pagination for large datasets.

Use tenant-aware queries and authorization checks consistently.

## 14. BACKEND API STRUCTURE

Create REST APIs following a clean architecture.

Suggested routes:

### Authentication
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me

### Chatbots
GET /api/chatbots
POST /api/chatbots
GET /api/chatbots/:id
PUT /api/chatbots/:id
DELETE /api/chatbots/:id
POST /api/chatbots/:id/duplicate

### AI Configuration
PUT /api/chatbots/:id/ai-config
POST /api/chatbots/:id/test-provider
GET /api/ai/providers
GET /api/ai/models

### Knowledge Base
POST /api/chatbots/:id/knowledge/upload
GET /api/chatbots/:id/knowledge
DELETE /api/chatbots/:id/knowledge/:fileId
POST /api/chatbots/:id/knowledge/:fileId/reprocess

### Products
GET /api/chatbots/:id/products
POST /api/chatbots/:id/products
POST /api/chatbots/:id/products/import
PUT /api/chatbots/:id/products/:productId
DELETE /api/chatbots/:id/products/:productId

### Widget
GET /api/widget/config/:publicId
POST /api/widget/chat
GET /api/widget/conversations/:conversationId

### Conversations
GET /api/conversations
GET /api/conversations/:id
DELETE /api/conversations/:id

### Analytics
GET /api/analytics/overview
GET /api/analytics/chatbots/:id

These are suggested endpoints. Adjust the final API architecture as necessary.

Public widget endpoints must only expose information required to render and operate the widget.

## 15. SECURITY REQUIREMENTS

Security is extremely important.

Implement:
- Password hashing.
- JWT authentication.
- Request validation.
- Rate limiting.
- CORS configuration.
- Secure API key encryption.
- File upload validation.
- File size restrictions.
- Secure file storage.
- Authorization middleware.
- Tenant isolation.
- Protection against NoSQL injection.
- Protection against XSS.
- Request size limits.
- API abuse prevention.

Never expose:
- AI provider API keys.
- MongoDB credentials.
- JWT secrets.
- Internal server configuration.
- Private document storage paths.

Do not trust chatbot IDs as authorization.

The backend must verify ownership on every private resource request.

Treat uploaded files, retrieved documents, and user messages as untrusted content.

## 16. USER INTERFACE AND DESIGN

Create a polished SaaS dashboard.

Design direction:
- Modern.
- Minimal.
- Professional.
- Clean typography.
- Consistent spacing.
- Responsive layouts.
- Sidebar navigation.
- Reusable components.
- Good loading and empty states.
- Clear error messages.

Suggested sidebar:

- Overview
- My Chatbots
- Conversations
- Knowledge Base
- Analytics
- API Configuration
- Settings

Each chatbot should have its own configuration workspace with tabs:

- General
- AI Settings
- Instructions
- Knowledge Base
- Products
- Appearance
- Embed
- Conversations
- Analytics

Do not build everything into one enormous component.

Use reusable components and maintainable folder structures.

## 17. PROJECT STRUCTURE

Organize the project cleanly.

Suggested structure:

client/
  src/
    components/
    pages/
    layouts/
    hooks/
    services/
    stores/
    types/
    utils/

server/
  src/
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
      ai/
      knowledge/
      products/
      widget/
      analytics/
    utils/
    validators/
    jobs/
    app.ts
    server.ts

widget/
  src/
    components/
    services/
    styles/
    index.ts

Use environment variables for configuration.

Provide separate environment examples for frontend, backend, and any worker processes.

## 18. PERFORMANCE AND SCALABILITY

Build the system with scalability in mind.

Requirements:
- Asynchronous document processing.
- Efficient database queries.
- Pagination.
- Caching where useful.
- Streaming AI responses.
- File size restrictions.
- Context-window management.
- Proper error handling.
- Background processing for large uploads.
- Configurable rate limits.

Use a background job queue if necessary for document processing.

Do not perform expensive document extraction or embedding operations synchronously inside normal chat requests.

## 19. TESTING

Implement meaningful tests for:

- User authentication.
- Chatbot creation.
- Chatbot ownership.
- AI provider configuration.
- API key security.
- File uploads.
- Document processing.
- Product imports.
- Product retrieval.
- Widget configuration.
- Chat requests.
- Tenant isolation.

Test the widget on a standalone HTML page.

Verify that the embed code works without React being installed on the target website.

Test at least two different AI providers to verify that the provider abstraction works.

## 20. DEVELOPMENT EXECUTION PLAN

Build the application in the following phases.

### Phase 1: Foundation
- Inspect the existing repository.
- Set up project structure.
- Configure frontend and backend.
- Configure MongoDB.
- Implement authentication.
- Build dashboard layout.

### Phase 2: Chatbot Management
- Create chatbot CRUD.
- Build chatbot configuration.
- Implement system prompts.
- Implement provider and model selection.

### Phase 3: AI Integration
- Implement provider abstraction.
- Integrate OpenAI.
- Integrate DeepSeek.
- Integrate Claude.
- Integrate Gemini.
- Integrate OpenRouter.
- Implement custom OpenAI-compatible provider support.
- Implement streaming and error handling.

### Phase 4: Knowledge Base
- Implement file uploads.
- Implement document extraction.
- Implement chunking.
- Implement embeddings.
- Implement vector retrieval.
- Connect retrieved knowledge to chatbot responses.

### Phase 5: Product Data
- Implement JSON, CSV, and Excel imports.
- Implement product CRUD.
- Implement structured product retrieval.
- Implement browser-supplied product JSON.
- Implement product question answering.

### Phase 6: Embeddable Widget
- Build standalone JavaScript widget.
- Implement chat interface.
- Connect widget to backend.
- Generate embed snippets.
- Implement customization.
- Implement domain restrictions.
- Test on independent websites.

### Phase 7: Conversations and Analytics
- Store conversations.
- Display chat histories.
- Implement analytics.
- Track provider usage and tokens.

### Phase 8: Security and Production
- Perform security checks.
- Test tenant isolation.
- Optimize database queries.
- Add logging.
- Add rate limiting.
- Improve error handling.
- Write deployment documentation.

## 21. IMPORTANT DEVELOPMENT INSTRUCTIONS

Follow these instructions throughout development.

1. First inspect the entire existing project before modifying anything.

2. If a project already exists, preserve its working functionality and existing conventions wherever possible.

3. Do not blindly replace existing files.

4. Do not create a frontend-only demo. Implement the actual backend, database, AI integration, and widget.

5. Do not use mock responses as substitutes for real AI integrations.

6. Do not hardcode API keys, model names, or provider configurations.

7. Make every dashboard button and configuration control functional.

8. Ensure all chatbot configurations are saved persistently.

9. Ensure every chatbot has completely independent settings and knowledge.

10. Ensure both product data input methods work independently and together.

11. Use clear TypeScript types and proper validation.

12. Handle loading states, empty states, errors, and network failures.

13. Write maintainable and modular code.

14. Do not leave critical functionality as TODO comments.

15. Do not claim a feature is complete until it has been implemented and tested.

16. Maintain a development checklist and update it as each phase is completed.

17. Run the application and fix build errors, runtime errors, and integration issues before considering the work complete.

## 22. FINAL EXPECTED RESULT

At the end, I should have a working AI chatbot builder platform where:

- I can register and log in.
- I can create unlimited chatbots.
- I can configure a unique system prompt for every chatbot.
- I can choose different AI providers and models.
- I can enter and securely store API keys.
- I can upload knowledge files to individual chatbots.
- I can import product information through JSON, CSV, and Excel files.
- I can provide product JSON through the website embedding configuration.
- The chatbot can answer questions using its uploaded knowledge and product data.
- I can customize the chatbot's appearance.
- I can generate an embed code.
- I can paste that code into any website.
- The chatbot appears and works independently of the website's framework.
- I can see conversations and analytics from the dashboard.

The final application must be a functional, extensible, secure, and production-oriented SaaS foundation.

**START BY INSPECTING THE EXISTING CODEBASE. THEN IMPLEMENT THE APPLICATION PHASE BY PHASE. DO NOT STOP AFTER CREATING THE UI.**