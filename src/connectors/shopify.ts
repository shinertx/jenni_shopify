import { shopifyApi, LATEST_API_VERSION, Session } from "@shopify/shopify-api";
import crypto from "crypto";
import { Connector } from "./interface.js";
import { checkEligibility } from "../core/eligibility.js";
import { JenniOrder } from "../core/types.js";
import { orderQueue } from "../queue.js";
import { shopTokens } from "../index.js";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_APP_URL,
} = process.env;

const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY!,
  apiSecretKey: SHOPIFY_API_SECRET!,
  scopes: (SHOPIFY_SCOPES ?? "").split(","),
  hostName: new URL(SHOPIFY_APP_URL!).host,
  isEmbeddedApp: true,
  apiVersion: LATEST_API_VERSION
});

// Helper to get GraphQL client
function graphqlClient(shop: string, accessToken: string) {
  const session = new Session({
    id: `${shop}-jenni-session`, // A unique ID for the session
    shop,
    accessToken,
    isOnline: false,
    state: 'state'
  });
  return new shopify.clients.Graphql({ session });
}

export const shopifyConnector: Connector = {
  platform: "shopify",

  verifyWebhook(raw, hmac) {
    const secret = process.env.SHOPIFY_API_SECRET || "";
    const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    return digest === hmac;
  },

  async extractEligibility(q, { shop, accessToken, productGid }) {
    const client = graphqlClient(shop, accessToken);
    const result: any = await client.query({
      data: {
        query: `query ($id: ID!) { product(id:$id){ variants(first:1){ nodes{ price }}}}`,
        variables: { id: productGid }
      }
    });
    if (!result.body || !result.body.data) throw new Error("GraphQL query failed");
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
    await orderQueue.add("order", jenniOrder);
    return jenniOrder;
  },

  async syncProduct(product: any) {
    console.log('Product sync received for', product.id);
    // TODO: Handle product sync
  },

  async updateStatus({ storeId, orderId, status }) {
    const accessToken = shopTokens[storeId];
    if (!accessToken) throw new Error(`No token for shop ${storeId}`);
    const client = graphqlClient(storeId, accessToken);

    // fetch fulfillmentOrder id
    const foRes: any = await client.query({
      data: {
        query: `query($orderId: ID!){ order(id:$orderId){ fulfillmentOrders(first:1){ nodes{ id }}}}`,
        variables: { orderId: `gid://shopify/Order/${orderId}` }
      }
    });
    if (!foRes.body || !foRes.body.data) throw new Error("GraphQL query failed");
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
        variables: {
          id: foId,
          status
        }
      }
    });
  }
};
