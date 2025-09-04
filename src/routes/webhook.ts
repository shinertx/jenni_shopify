import { Router } from "express";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { shopifyConnector } from "../connectors/shopify.js";
import { orderQueue as queue } from "../queue.js";
import { JenniOrder } from "../core/types.js";

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
    const shopDomain = req.get("X-Shopify-Shop-Domain")!;
    const idempotency_key = crypto
      .createHash("sha256")
      .update(`${shopDomain}:${order.id}`)
      .digest("hex");

    const payload: JenniOrder & { idempotency_key: string } = {
      storeId: order.shop_id.toString(),
      orderId: order.id.toString(),
      address: {
        line1: order.shipping_address.address1,
        city: order.shipping_address.city,
        state: order.shipping_address.province_code,
        zip: order.shipping_address.zip
      },
      lines: order.line_items.map((l: any) => ({
        gtin: l.sku,
        quantity: l.quantity,
        price: Number(l.price)
      })),
      idempotency_key
    };

    await queue.add("forward-order", payload, {
      jobId: idempotency_key,
      removeOnComplete: true,
      removeOnFail: false
    });
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
    if (!shopifyConnector.syncProduct) return res.status(404).end();
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
