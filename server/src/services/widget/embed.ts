import { env } from '../../config/env.js';
import type { ChatbotDoc } from '../../models/Chatbot.js';

/** Generates copy-paste installation snippets for the Embed tab. */
export function embedSnippets(chatbot: ChatbotDoc) {
  const src = `${env.PUBLIC_API_URL}/widget.js`;
  const id = chatbot.publicId;
  const theme = chatbot.widget?.theme ?? 'light';

  const basic = `<script>
  window.AIChatbotConfig = {
    chatbotId: "${id}",
    theme: "${theme}"
  };
</script>
<script src="${src}" async></script>`;

  const withProducts = `<script>
  window.AIChatbotConfig = {
    chatbotId: "${id}",
    // Optional: products visible on this page (used as unverified page context).
    products: [
      {
        id: "P001",
        name: "Wireless Headphones",
        price: 2499,
        currency: "INR",
        description: "Bluetooth wireless headphones",
        availability: "In Stock",
        category: "Electronics",
        url: "https://example.com/headphones"
      }
    ]
  };
</script>
<script src="${src}" async></script>`;

  const customStyling = `<script>
  window.AIChatbotConfig = {
    chatbotId: "${id}",
    theme: "dark",              // "light" | "dark" | "auto"
    position: "bottom-left",    // "bottom-right" | "bottom-left"
    primaryColor: "#0ea5e9",    // overrides the dashboard setting on this page
    openOnLoad: false,
    zIndex: 2147483000
  };
</script>
<script src="${src}" async></script>`;

  const javascriptApi = `// Available after widget.js has loaded:
window.AIChatbot.open();
window.AIChatbot.close();
window.AIChatbot.toggle();
window.AIChatbot.sendMessage("Do you have mechanical keyboards?");
window.AIChatbot.setProducts([{ id: "P002", name: "Mechanical Keyboard", price: 3499, currency: "INR" }]);
window.AIChatbot.resetConversation();

// Or wait for it:
window.addEventListener("aichatbot:ready", function () { /* ... */ });`;

  const react = `// Next.js (app router): app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script id="ai-chatbot-config" strategy="afterInteractive">
          {\`window.AIChatbotConfig = { chatbotId: "${id}" };\`}
        </Script>
        <Script src="${src}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`;

  return {
    publicId: id,
    widgetUrl: src,
    apiBase: env.PUBLIC_API_URL,
    testPageUrl: `${env.PUBLIC_API_URL}/embed-test/${id}`,
    snippets: { basic, withProducts, customStyling, javascriptApi, react },
  };
}
