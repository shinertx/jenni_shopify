import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { shopTokens } from './index.js';
import { shopify } from './connectors/shopify.js';

// Minimal OAuth for Shopify public app (Authorization Code Flow)
// NOTE: Replace placeholders with env vars and add persistence for production.

export const auth = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const APP_URL = process.env.SHOPIFY_APP_URL || '';
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_products';

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

    const shopDomain = shop as string;
    await shopify.webhooks.register({
      shop: shopDomain,
      accessToken,
      topics: ['ORDERS_CREATE', 'APP_UNINSTALLED'],
      callbackUrl: `${process.env.APP_URL}/webhooks/shopify/order`
    });

    // Redirect to embedded app inside admin
    res.redirect(`https://${shop}/admin/apps/${SHOPIFY_API_KEY}`);
  } catch (e:any) {
    console.error('OAuth error', e.response?.data || e.message);
    res.status(500).send('OAuth failed');
  } finally {
    pendingStates.delete(state);
  }
});
