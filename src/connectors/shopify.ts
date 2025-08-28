import { Shopify } from "@shopify/shopify-api";
import crypto from "crypto";
import { Connector } from "./interface.js";
import { checkEligibility } from "../core/eligibility.js";
import { JenniOrder } from "../core/types.js";
import { orderQueue } from "../queue.js";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_APP_URL,
  SHOPIFY_ADMIN_API_VERSION
} = process.env;

export const shopify = new Shopify({
  apiKey: SHOPIFY_API_KEY!,
  apiSecretKey: SHOPIFY_API_SECRET!,
  scopes: (SHOPIFY_SCOPES ?? "").split(","),
  hostName: new URL(SHOPIFY_APP_URL!).host,
  isEmbeddedApp: true,
  apiVersion: SHOPIFY_ADMIN_API_VERSION as any
});

// Helper to get GraphQL client
function graphqlClient(session: any) {
  return new shopify.clients.Graphql({ session });
}

export const shopifyConnector: Connector = {
  platform: "shopify",

  verifyWebhook(raw, hmac) {
    const secret = process.env.SHOPIFY_API_SECRET || "";
    const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    return digest === hmac;
  },

  async extractEligibility(q, { session, productGid }) {
    const client = graphqlClient(session);
    const result = await client.query({
      data: {
        query: `query ($id: ID!) { product(id:$id){ variants(first:1){ nodes{ price }}}}`,
        variables: { id: productGid }
      }
    });
    q.price = Number(result.body.data.product.variants.nodes[0].price);
    const res = await checkEligibility(q);
    return res.eligible;
  },

  async forwardOrder(order) {
    const jenniOrder: JenniOrder = {
      storeId: order.shop_id.toString(),
      orderId: order.id.toString(),
      address: {
        line1: order.shipping_address.address1,
        city: order.shipping_address.city,
        state: order.shipping_address.province_code,
        zip: order.shipping_address.zip
      },
      lines: order.line_items.map((l: any) => ({
        gtin: l.sku, // Assuming Shopify SKU contains GTIN
        quantity: l.quantity,
        price: Number(l.price)
      }))
    };
    // push to queue to avoid webhook timeout
    await orderQueue.add("forward-order", jenniOrder);
    return jenniOrder;
  },

  async updateStatus({ storeId, orderId, status }) {
    const session = await shopify.sessionStorage.loadSession(storeId);
    const client = graphqlClient(session);

    // fetch fulfillmentOrder id
    const foRes = await client.query({
      data: {
        query: `query($orderId: ID!){ order(id:$orderId){ fulfillmentOrders(first:1){ nodes{ id }}}}`,
        variables: { orderId: `gid://shopify/Order/${orderId}` }
      }
    });
    const foId = foRes.body.data.order.fulfillmentOrders.nodes[0].id;

    await client.query({
      data: {
        query: `
          mutation fulfill($id: ID!, $status: FulfillmentStatus!) {
            fulfillmentCreateV2(
              fulfillment: {
                trackingInfo: { number: "", url: "" },
                notifyCustomer: true,
                lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: $id }]
              }
            ) { fulfillment { id } userErrors { field message } }
            fulfillmentOrderUpdateTrackingInfo(
              fulfillmentOrderId: $id, trackingInfo: { number: "", url: "" }, notifyCustomer: true
            ) { userErrors { field message } }
          }
        `,
        variables: { id: foId, status: status === "Delivered" ? "SUCCESS" : "FAILURE" }
      }
    });
  },

  async syncProduct(product) {
    // Ingest minimal fields for GTIN graph enrichment (noop placeholder)
    // Example fields: product.id, title, vendor, variants[].barcode (GTIN), variants[].sku
  }
};
