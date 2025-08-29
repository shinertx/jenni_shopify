# JENNi Same‑Day Delivery – Shopify App (5‑minute guide)

TL;DR: Public Shopify app that shows same‑day availability by GTIN and can forward orders to JENNi. Includes a Theme App Extension widget, a minimal App Proxy API, and webhook stubs.

## Quick start
1. Copy env and fill values
   - cp .env.example .env
   - Set SHOPIFY_API_KEY/SHOPIFY_API_SECRET, SHOPIFY_APP_URL (https ngrok URL), and JENNI_*:
     - JENNI_CLIENT_ID / JENNI_CLIENT_SECRET
     - JENNI_API_HOST
     - JENNI_ORDERS_URL
     - JENNI_API_KEY
2. Install & run
   - npm install
   - npm run dev (API at http://localhost:4000)
   - npm run demo (demo site at http://localhost:3000)
   - npm test (quick mocked sanity check)
3. Install the app to a dev store
   - https://<your-shop>.myshopify.com/admin/oauth/authorize?client_id=$SHOPIFY_API_KEY&scope=read_products&redirect_uri=$SHOPIFY_APP_URL/auth/callback

## How it works
- Theme (or any frontend) → App Proxy → Eligibility
  - Widget calls: /apps/jenni/v1/eligibility?zip=75062&gtin=GTIN
  - Server fetches JENNi API with cached OAuth token; results cached in Redis.
- Webhooks
  - HMAC‑verified endpoints under /webhooks (GDPR, products, orders).
  - Orders are pushed to a BullMQ queue → submitOrder posts to the JENNi orders API.
- OAuth (minimal)
  - /auth/install and /auth/callback acquire a shop access token (not yet persisted).

### Request Flow (at a glance)
```
Browser (widget/demo)
   │  GET /apps/jenni/v1/eligibility?gtin=...&zip=...
   ▼
Shopify App Proxy → Express (src/index.ts → src/routes/jenni.ts)
   │  calls checkEligibility({ gtin, zip })
   ▼
Core (src/core/eligibility.ts)
   │  getAccessToken() → JENNi /auth/token (cached)
   │  POST /searchProducts (page_size=10)
   │  parse zipcode_inventory for zip
   ▼
Response { eligible: boolean } (cached in Redis 10m)

Order Flow (webhook)
Shopify orders/create → Express /webhooks/shopify/order
   │  map to JenniOrder (src/connectors/shopify.ts)
   │  enqueue (src/queue.ts) → worker submits to JENNi Orders API
   ▼
Optional status updates → Shopify GraphQL (fulfillment)
```

## Key routes
- App Proxy API
  - GET /apps/jenni/v1/eligibility (also mounted at /v1)
- Webhooks
  - POST /webhooks/gdpr/customers/data_request
  - POST /webhooks/gdpr/customers/redact
  - POST /webhooks/gdpr/shop/redact
  - POST /webhooks/shopify/products (products/create|update)
  - POST /webhooks/shopify/order (orders/create)
- OAuth
  - GET /auth/install
  - GET /auth/callback

## Repo map (what to look at)
- src/
  - index.ts – app entry; mounts auth, proxy API, and webhooks
  - routes/jenni.ts – eligibility endpoint
  - routes/webhook.ts – Shopify + JENNi webhooks
  - routes/gdpr.ts – mandatory GDPR endpoints
  - connectors/shopify.ts – Shopify GraphQL, webhook HMAC, queues
  - core/eligibility.ts – JENNi token + searchProducts + Redis cache
  - lib/jenniConnector.ts – submits orders to JENNi
  - core/order.ts – thin wrapper exporting the connector
  - queue.ts – BullMQ wiring
- tests/ – Node test scripts (e.g., tests/test-simple.js)
- examples/frontend – browser demos (moved from root)
- extensions/jenni-availability-widget – Theme App Extension (widget)
- functions/delivery-customization – Shopify Function example
- test-store/ + scripts/demo-server.js – local demo and API proxy
- jenni-universal.js – browser library used in demos
- shopify.app.toml – app config (proxy, scopes, webhook topics)

## Architecture Diagram
See `docs/architecture.md` for Mermaid diagrams of the eligibility request flow, webhook/order processing, and connector layout.

## Platform Connectors
- Interface: `src/connectors/interface.ts:1` defines the `Connector` contract:
  - `verifyWebhook(rawBody, hmac)`
  - `extractEligibility(query, platformData)`
  - `forwardOrder(order)`
  - `updateStatus(status)`
- Shopify implementation: `src/connectors/shopify.ts:1` demonstrates:
  - GraphQL calls using a session
  - Mapping orders to `JenniOrder`
  - Updating fulfillment status
- Add a new platform:
  - Create `src/connectors/<platform>.ts` implementing `Connector`
  - Keep JENNi API logic inside `src/core/*` for reuse
  - Add routes/adapters in `src/routes/` if needed
  - Put demos under `examples/` decoupled from `src/`

## Repo hygiene & agent ops
- See AGENTS.md for operating rules, structure, and cleanup protocol.

## Shopify setup (minimal)
- App Proxy (Partner Dashboard → App setup → App proxy)
  - Prefix: apps, Subpath: jenni, Proxy URL: $SHOPIFY_APP_URL/apps/jenni
- Scopes: at least read_products for the demo
- Webhooks: configured in shopify.app.toml (GDPR and product updates)

## Notes / next steps
- Replace all placeholder secrets before use; do not ship client secrets to the browser.
- Persist OAuth tokens per shop and auto‑register webhooks on install.
- Add session storage for Shopify API; load sessions by storeId in connectors.
- Optional: Add tests (HMAC verification, eligibility parsing) and CI.
