import "@shopify/shopify-api/adapters/node";
import "dotenv/config";
import express from "express";
import pino from "pino-http";
import { jenni } from "./routes/jenni.js";
import { webhook } from "./routes/webhook.js";
import { gdpr } from "./routes/gdpr.js";
import { edge } from "./routes/edge.js";
import { auth } from "./auth.js";
import "./queue.js"; // initialise queue workers
import { checkEligibility } from "./core/eligibility.js";
import { shopTokens } from "./tokens.js";

const app = express();
app.use(pino());
app.use(express.json());

// Simple in-memory shop token map (replace with Redis/DB in prod)
// Centralized in src/tokens.ts to avoid circular imports
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tokens = shopTokens;

// Health
app.get('/_health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    message: "JENNi Shopify App Backend is running.",
    endpoints: {
      health: "/_health",
      install: "/auth/install?shop=YOUR-STORE.myshopify.com",
      availability: "/v1/availability?gtin=GTIN&zip=ZIP"
    }
  });
});

// Public availability proxy (server-side JENNi call)
app.get('/v1/availability', async (req, res) => {
  const { gtin, zip, storeId = 'demo-store' } = req.query as any;
  if (!gtin || !zip) return res.status(400).json({ error: 'Missing gtin or zip' });
  try {
    const result = await checkEligibility({ gtin, zip, storeId });
    res.json(result);
  } catch (e:any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// OAuth install flow
app.use('/auth', auth);

// Core API
app.use("/v1", jenni);

// Shopify App Proxy (maps to same handlers)
app.use("/apps/jenni/v1", jenni);

// Webhooks
app.use("/webhooks", webhook);
app.use("/webhooks/gdpr", gdpr);

// Serve static installer pages under /edge (install.html, play.html)
app.use('/edge', express.static('public/edge'));

// Edge demo API (for bookmarklet/GTM demos)
app.use('/edge', edge);

// Serve magic-link demo at /go (static page)
app.use('/go', express.static('public/go'));

// Single-CTA landing that auto-routes (Shopify vs GTM vs Instant Preview)
app.use('/try', express.static('public/try'));

// Demo hub landing page
app.get('/demo', async (_req, res) => {
  try {
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const p = resolve(process.cwd(), 'examples/demo/index.html');
    const html = await readFile(p, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(404).send('Demo page not found');
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`▶ JENNi-Universal running on :${port}`));
