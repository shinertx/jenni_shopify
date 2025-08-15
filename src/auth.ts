import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { shopTokens } from './index.js';

// Minimal OAuth for Shopify public app (Authorization Code Flow)
// NOTE: Replace placeholders with env vars and add persistence for production.

export const auth = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const APP_URL = process.env.SHOPIFY_APP_URL || '';
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_products';
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';

const pendingStates = new Map<string,string>();

function hmacValid(query: any): boolean {
  const { hmac, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(message).digest('hex');
  return digest === hmac;
}

auth.get('/install', (req, res) => {
  const shop = req.query.shop as string;
  if (!shop) return res.status(400).send('Missing shop');
  const redirectUri = `${APP_URL}/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, shop);
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;
  res.redirect(installUrl);
});

auth.get('/callback', async (req, res) => {
  const { shop, code, hmac, state } = req.query as any;
  if (!shop || !code || !state) return res.status(400).send('Missing params');
  if (!pendingStates.has(state) || pendingStates.get(state) !== shop) return res.status(400).send('Bad state');
  if (!hmacValid(req.query)) return res.status(400).send('Invalid HMAC');

  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });
    const accessToken = tokenRes.data.access_token as string;
    shopTokens[shop] = accessToken;

    // Register webhooks (order create, app/uninstalled, product update)
    const webhookTopics = [
      { topic: 'orders/create', path: '/webhooks/shopify/order' },
      { topic: 'app/uninstalled', path: '/webhooks/gdpr' },
      { topic: 'products/update', path: '/webhooks/shopify/products' }
    ];

    for (const w of webhookTopics) {
      try {
        await axios.post(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
          webhook: {
            topic: w.topic,
            address: `${APP_URL}${w.path}`,
            format: 'json'
          }
        }, { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } });
      } catch (e:any) {
        console.error('Webhook register failed', w.topic, e.response?.data || e.message);
      }
    }

    // Redirect to embedded app inside admin
    res.redirect(`https://${shop}/admin/apps/${SHOPIFY_API_KEY}`);
  } catch (e:any) {
    console.error('OAuth error', e.response?.data || e.message);
    res.status(500).send('OAuth failed');
  } finally {
    pendingStates.delete(state);
  }
});
