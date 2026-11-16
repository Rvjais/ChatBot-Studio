# Embedding the Chatbot on Your Website

The widget is one script (`widget.js`, ~10 KB gzipped). It has no dependencies, does not use or require React, and renders inside a Shadow DOM so your site's CSS cannot break it (and it cannot break your site).

Your **public chatbot ID** (`cb_…`) is shown in the dashboard → chatbot → **Embed** tab, which also generates every snippet below. The public ID is not a secret: API keys and your system prompt never reach the browser.

## 1. Basic installation

Paste before `</body>` on every page where the chat should appear:

```html
<script>
  window.AIChatbotConfig = {
    chatbotId: "cb_YOUR_PUBLIC_ID",
    theme: "light"
  };
</script>
<script src="https://YOUR-DOMAIN.com/widget.js" async></script>
```

| Platform | Where to paste |
|---|---|
| Plain HTML / PHP | Before `</body>` in your template/footer include |
| WordPress | Theme footer (`footer.php`) or a header/footer scripts plugin, "Footer" section |
| Shopify | *Online Store → Themes → Edit code → `layout/theme.liquid`*, before `</body>` |
| Next.js | `next/script` in `app/layout.tsx` (snippet in the Embed tab) |
| React (Vite/CRA) | `index.html` before `</body>`, or inject the two scripts in a top-level `useEffect` |
| Webflow / Wix / Squarespace | "Custom code" → footer code |

To test without touching your site, open the **standalone test page** linked in the Embed tab (`/embed-test/<publicId>`).

## 2. Configuration options

| Option | Type | Description |
|---|---|---|
| `chatbotId` | string | **Required.** Public chatbot ID. |
| `apiBase` | string | API origin. Defaults to the origin `widget.js` is loaded from. |
| `theme` | `"light" \| "dark" \| "auto"` | Overrides the dashboard theme on this page (`auto` follows the visitor's OS). |
| `position` | `"bottom-right" \| "bottom-left"` | Launcher position. |
| `primaryColor` | hex color | Overrides the brand color on this page. |
| `openOnLoad` | boolean | Open the chat immediately. |
| `zIndex` | number | Stacking order (default `2147483000`). |
| `products` | array | Products visible on this page (see §4). |

Everything else — title, subtitle, colors, avatar, border radius, size, launcher text, suggested questions, welcome message, branding — is set in the dashboard **Appearance** tab and applies instantly without changing the snippet.

## 3. JavaScript API

```js
window.addEventListener("aichatbot:ready", () => {
  window.AIChatbot.open();                       // open / close / toggle
  window.AIChatbot.sendMessage("Do you ship to Pune?");
  window.AIChatbot.setProducts([{ id: "P002", name: "Mechanical Keyboard", price: 3499, currency: "INR" }]);
  window.AIChatbot.resetConversation();          // start a fresh conversation
});
```

Conversations persist per visitor in the browser (anonymous random visitor ID in `localStorage`) and are restored when the visitor returns.

## 4. Product data

There are two independent ways to give the chatbot product information; they can be combined.

### A. Catalog in the dashboard (authoritative)
Upload JSON, CSV or Excel in the **Products** tab, edit products there, or push them from your backend with the **Product Sync API**. These records are *verified*: the bot quotes prices, IDs and availability exactly as stored, and answers are checked afterwards — any price not found in the supplied data is flagged and annotated.

### B. Products supplied by the page (`products` option)
Useful for "what's on this page" context, e.g. a product detail or category page:

```html
<script>
  window.AIChatbotConfig = {
    chatbotId: "cb_YOUR_PUBLIC_ID",
    products: [
      { id: "P001", name: "Wireless Headphones", price: 2499, currency: "INR",
        description: "Bluetooth wireless headphones", availability: "In Stock",
        category: "Electronics", url: "https://example.com/headphones" }
    ]
  };
</script>
```

Rules for page-provided data:
- It is treated as **unverified context** (anyone can edit page HTML). The bot presents such prices as "shown on this page", and the **dashboard catalog always wins** when the same product ID exists in both — price conflicts are detected and the verified price is used.
- Never use it for authoritative transactions; checkout must use your own backend prices.
- Limits (defaults): **100 products** and **64 KB** per request. Invalid entries are dropped; non-http(s) URLs are removed. Owners can disable page products per chatbot.
- Field names are flexible: `id`/`sku`, `name`/`title`, `price`, `currency`, `description`, `availability`/`stock`, `category`, `url`, `image`; other fields are kept as attributes.

### Product Sync API (large catalogs)
Generate a sync key in **Embed → Product Sync API** (shown once), then from your server:

```bash
curl -X POST https://YOUR-DOMAIN.com/api/v1/sync/products \
  -H "Authorization: Bearer cbsk_..." \
  -H "Content-Type: application/json" \
  -d '{"mode":"upsert","products":[{"id":"P001","name":"Wireless Headphones","price":2499,"currency":"INR"}]}'
```

`mode: "replace"` removes catalog products missing from the payload. Up to 5,000 products / 10 MB per call. Keep the key on your server — never in browser code.

## 5. Domain restrictions

In the Embed tab, enable **Restrict to allowed domains** and list where the chat may run:

| Entry | Matches |
|---|---|
| `example.com` | `example.com` and `www.example.com` |
| `*.example.com` | any subdomain and the apex |
| `shop.example.com` | that host only |
| `localhost:3000` | local development on that port |

Requests from other sites are rejected before any AI call is made. Enabling the restriction with an empty list blocks every site. This uses the browser's `Origin` header, which stops other websites from embedding your bot; scripted (non-browser) abuse is limited by rate limits.

## 6. Troubleshooting

Open the browser console — the widget logs a single `[AIChatbot] …` line when it cannot start:

| Message | Fix |
|---|---|
| `chatbotId is missing` | Define `window.AIChatbotConfig` **before** the `widget.js` script tag. |
| `404 CHATBOT_NOT_FOUND` | Wrong ID, or the chatbot is **inactive** (activate it in the dashboard). |
| `403 DOMAIN_NOT_ALLOWED` | Add this site's domain to the allowed domains (or disable the restriction). |
| Chat says it is having trouble answering | Check AI Settings → *Test connection*; failed answers show the provider error in **Conversations**. |
