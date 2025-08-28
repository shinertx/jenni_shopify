import "dotenv/config";
import express from "express";
import pino from "pino-http";
import { jenni } from "./routes/jenni.js";
import { webhook } from "./routes/webhook.js";
import { gdpr } from "./routes/gdpr.js";
import { auth } from "./auth.js";
import "./queue.js"; // initialise queue workers
import { checkEligibility } from "./core/eligibility.js";

const app = express();
app.use(pino());
app.use(express.json());

// Health
app.get('/_health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
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

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`▶ JENNi-Universal running on :${port}`));
