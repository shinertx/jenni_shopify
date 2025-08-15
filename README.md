# JENNi Same‑Day Delivery – Shopify App (5‑minute guide)

TL;DR: Public Shopify app that shows same‑day availability by GTIN and can forward orders to JENNi. Includes a Theme App Extension widget, a minimal App Proxy API, and webhook stubs.

## Quick start
1. Copy env and fill values
   - cp .env.example .env
   - Set SHOPIFY_API_KEY/SHOPIFY_API_SECRET, SHOPIFY_APP_URL (https ngrok URL), and JENNI_*.
2. Install & run
   - npm install
   - npm run dev (API at http://localhost:4000)
   - npm run demo (demo site at http://localhost:3000)
3. Install the app to a dev store
   - https://<your-shop>.myshopify.com/admin/oauth/authorize?client_id=$SHOPIFY_API_KEY&scope=read_products&redirect_uri=$SHOPIFY_APP_URL/auth/callback

## How it works
- Theme (or any frontend) → App Proxy → Eligibility
  - Widget calls: /apps/jenni/v1/eligibility?zip=75062&gtin=GTIN
  - Server fetches JENNi API with cached OAuth token; results cached in Redis.
- Webhooks
  - HMAC‑verified endpoints under /webhooks (GDPR, products, orders).
  - Orders are pushed to a BullMQ queue → submitOrder (placeholder until JENNi order API is ready).
- OAuth (minimal)
  - /auth/install and /auth/callback acquire a shop access token (not yet persisted).

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
  - core/order.ts – submitOrder placeholder
  - queue.ts – BullMQ wiring
- extensions/jenni-availability-widget – Theme App Extension (widget)
- functions/delivery-customization – Shopify Function example
- test-store/ + scripts/demo-server.js – local demo and API proxy
- jenni-universal.js – browser library used in demos
- shopify.app.toml – app config (proxy, scopes, webhook topics)

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
