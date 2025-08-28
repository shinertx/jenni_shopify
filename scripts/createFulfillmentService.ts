import "dotenv/config";
import { shopifyApi } from "@shopify/shopify-api";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_APP_URL,
  SHOPIFY_ADMIN_API_VERSION
} = process.env;

const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY!,
  apiSecretKey: SHOPIFY_API_SECRET!,
  scopes: (SHOPIFY_SCOPES ?? "").split(","),
  hostName: new URL(SHOPIFY_APP_URL!).host,
  isEmbeddedApp: true,
  apiVersion: SHOPIFY_ADMIN_API_VERSION as any
});

(async () => {
  const session = await shopify.session.findSessionsByShop("YOURSHOP.myshopify.com").then((s: any[]) => s[0]);
  if (!session) throw new Error("Session not found");
  const client = new shopify.clients.Graphql({ session });
  const res = await client.query({
    data: {
      query: `
        mutation createService {
          fulfillmentServiceCreate(
            name: "JENNi",
            callbackUrl: "${SHOPIFY_APP_URL}/webhooks/shopify/fulfillment",
            trackingSupport: true,
            inventoryManagement: true,
            permitsSandboxShipping: true
          ) { userErrors { field message } fulfillmentService { id } }
        }
      `
    }
  });
  console.log(res.body);
})();
