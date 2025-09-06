import { Router } from "express";
import express from "express";
import bodyParser from "body-parser";
import { shopifyConnector } from "../connectors/shopify.js";

export const webhook = Router();

// shopify order create
webhook.post(
  "/shopify/order",
  bodyParser.raw({ type: "*/*" }),
  async (req, res) => {
    if (!shopifyConnector.verifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256")!)) {
      return res.status(401).end();
    }
    const order = JSON.parse(req.body.toString("utf8"));
    await shopifyConnector.forwardOrder(order);
    res.status(200).end(); // immediate ack
  }
);

// shopify products sync
webhook.post(
  "/shopify/products",
  bodyParser.raw({ type: "*/*" }),
  async (req, res) => {
    if (!shopifyConnector.verifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256")!)) {
      return res.status(401).end();
    }
    const product = JSON.parse(req.body.toString("utf8"));
    if (!shopifyConnector.syncProduct) return res.status(404).end();
    await shopifyConnector.syncProduct(product);
    res.status(200).end();
  }
);

// jenni status
webhook.post("/jenni/status", express.json(), async (req, res) => {
  await shopifyConnector.updateStatus(req.body);
  res.status(200).end();
});

// shopify app/uninstalled
webhook.post(
  "/shopify/app-uninstalled",
  bodyParser.raw({ type: "*/*" }),
  async (req, res) => {
    if (!shopifyConnector.verifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256")!)) {
      return res.status(401).end();
    }
    try {
      const payload = JSON.parse(req.body.toString("utf8"));
      // Optional cleanup handled in tokens module if present
      try {
        const { shopTokens } = await import("../tokens.js");
        if (payload?.myshopify_domain && shopTokens[payload.myshopify_domain]) {
          delete shopTokens[payload.myshopify_domain];
        }
      } catch {}
      res.status(200).end();
    } catch {
      res.status(200).end();
    }
  }
);
