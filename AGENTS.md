# AGENTS.md — Agent Operating Guide

This document tells AI agents how to work safely and effectively in this repo.

## Repo Purpose
- Shopify app and demo integrating JENNi same‑day/next‑day delivery.
- Backend: Node.js/TypeScript/Express; calls JENNi APIs and Shopify GraphQL.
- Frontend examples: Theme App Extension widget and simple demo pages.

Key entry points:
- `src/index.ts` — Express app and routes wiring.
- `src/routes/jenni.ts` — eligibility endpoint (App Proxy + public `/v1`).
- `src/core/eligibility.ts` — JENNi auth, product lookup, Redis caching.
- `src/connectors/shopify.ts` — Shopify GraphQL + webhook/HMAC + queue.
- `src/routes/webhook.ts`, `src/routes/gdpr.ts`, `src/auth.ts` — webhooks & OAuth.
- `extensions/jenni-availability-widget` — Theme App Extension assets.
- `scripts/demo-server.cjs` — demo proxy; `test-store/*` — static demo pages.

## Agent Expectations
- Be precise and minimal; change only what’s needed for the task.
- Use a short plan for multi‑step tasks; keep one step in progress.
- Explain before running groups of commands; keep preambles concise.
- Prefer reading with `rg` and editing via `apply_patch`. Do not `git commit`.
- Validate changes by running targeted commands when appropriate.
- Never hardcode secrets; use `.env` (see `.env.example`).
- Keep tokens and client secrets server‑side only.
- Keep the repo clean and predictable; follow the hygiene rules below.

## Local Setup and Commands
- Runtime: Node 18+ recommended.
- Copy env: `cp .env.example .env` and set:
  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`
  - `JENNI_CLIENT_ID`, `JENNI_CLIENT_SECRET`, `JENNI_API_HOST`
  - Optional: `REDIS_URL` (for caching), `JENNI_ORDERS_URL`, `JENNI_API_KEY`
- Install deps: `npm install`
- Dev server: `npm run dev` (Express on `http://localhost:4000`)
- Demo server: `npm run demo` (static demo on `http://localhost:3000`)
- Health check: `npm run check` (GET `/_health`)
- Build/start (TS → JS): `npm run build` then `npm start`

Lightweight test scripts (manual):
- `node tests/test-simple.js` — mocked JENNi frontend core basics
- `node tests/testJenniAPI.js` or `node scripts/testJenniAPI.ts` (if configured) — API probes

## Code Conventions
- TypeScript ESM (`type: module`); use `import` paths with `.js` extensions from TS.
- Keep style consistent with existing code; prefer `axios`, `express`, `ioredis`, `bullmq` already in use.
- Avoid inline comments unless essential; keep functions small and focused.
- API timeouts/retries: add only where relevant; avoid broad global changes.
- Caching: Redis TTL is 10m in `eligibility.ts`; don’t change semantics casually.

## Repository Hygiene
- Root stays clean: no ad‑hoc tests, logs, or backups at the top level.
- Preferred layout:
  - `src/` — core logic and platform connectors only
  - `tests/` — Node test scripts (no browser assets)
  - `examples/` — demo HTML/JS and showcase apps (e.g., `examples/frontend/`)
  - `scripts/` — local dev utilities and small helpers
  - `extensions/`, `functions/` — Shopify extension/function code
  - `dist/` — build output (ignored)
- Shims: small `.js` files in `src/` may exist to bridge ESM paths (e.g., `routes/gdpr.js`). Don’t remove unless imports are updated and build verified.
- No backups: don’t create files like `package.json.backup` or `test-package.json`.
- No logs/binaries: don’t commit `*.log`, `build.out`, or platform binaries; add ignores if needed.
- Quarantine before delete: if unsure, move to `examples/` or `tests/` instead of deleting. Only delete empty/duplicated or provably unused files.

## Multi‑Platform Expansion
- Keep domain logic platform‑agnostic in `src/core/*` (auth, eligibility, orders).
- Add a new connector under `src/connectors/<platform>.ts` implementing the `Connector` interface.
- Avoid leaking platform‑specific types into `core/`.
- Expose platform APIs via routes grouped per platform or via a stable `/v1` surface.
- Demos for non‑Shopify platforms live in `examples/` with minimal coupling to `src/`.

## Security & Secrets
- Never expose `JENNI_CLIENT_ID`/`JENNI_CLIENT_SECRET` or access tokens to the browser.
- Treat `.env` values as sensitive; do not print or check in.
- Webhooks must verify HMAC (see `shopify.ts::verifyWebhook`).

## Where to Implement Changes
- Eligibility logic or JENNi params: `src/core/eligibility.ts`.
- App Proxy/HTTP shape: `src/routes/jenni.ts`, `src/index.ts`.
- Shopify‑specific flows (GraphQL, orders, status): `src/connectors/shopify.ts`.
- OAuth + token storage during install: `src/auth.ts`, `src/index.ts (shopTokens)`.
- Widget / Theme App Extension: `extensions/jenni-availability-widget/*`.
- Demo behavior: `scripts/demo-server.cjs`, `test-store/*`.

## Common Tasks (Recipes)
- Update JENNi page size to 10: verify `page_size: 10` in `eligibility.ts`.
- Gracefully handle 404/empty products: catch API errors, return `{ eligible:false }`.
- Add retry on token fetch: wrap `getAccessToken()` with limited retries (`p-retry`).
- Add field to eligibility response: modify `EligibilityResult` in `src/core/types.ts` and return shape in `eligibility.ts`; keep `/v1/eligibility` backwards‑compatible when possible.
- Forward order changes: update mapping in `shopify.ts::forwardOrder` and queue worker in `src/queue.ts`.
- Move/organize demos and tests:
  - Browser demos → `examples/frontend/`
  - Node test scripts → `tests/`
  - One PM2 config: keep `ecosystem.config.cjs` and remove duplicates
  - Don’t delete `.js` shims in `src/` without updating imports

## Testing & Validation
- Start dev server and hit: `GET /v1/availability?gtin=...&zip=...`.
- Run `node tests/test-simple.js` to sanity‑check mocked flows.
- Prefer targeted checks over broad integration runs.
 - After moves, update paths in demos/tests and re‑run minimal checks.

## Tooling Rules for Agents (Codex CLI)
- File edits: always via `apply_patch`. Do not create branches or commit.
- Searches: use `rg`/`rg --files`. Read files in ≤250 line chunks.
- Plans: keep short and update as you progress; exactly one step `in_progress`.
- Approvals: request escalation only if sandbox blocks essential commands (e.g., network install).
- Final messages: concise, list changed files and next steps.

## Cleanup Protocol (Triple‑Validation)
- Step 1 (classify): identify files as core, demo/test, build/log, or duplicate.
- Step 2 (relocate): move demo/test files into `examples/` or `tests/` and update references.
- Step 3 (remove): delete only empty files, obvious backups, and duplicate configs after confirming no references via `rg`.
- Step 4 (guard): add `.gitignore` entries to prevent re‑introducing clutter.

## Don’ts
- Don’t import new frameworks or restructure the project without being asked.
- Don’t leak or invent credentials; don’t move secrets to client code.
- Don’t modify unrelated files or rewrite large areas for small fixes.

## Definition of Done
- Change is minimal, focused, and consistent with current style.
- Local validation passes (endpoint responds or script runs as expected).
- Docs updated if interfaces/behavior changed (README or this file as needed).
