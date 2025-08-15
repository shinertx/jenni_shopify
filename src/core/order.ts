import axios from "axios";
import { JenniOrder, JenniTokenResponse } from "./types.js";
const { JENNI_CLIENT_ID, JENNI_CLIENT_SECRET, JENNI_API_HOST } = process.env;

let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const { data } = await axios.post<JenniTokenResponse>(
    `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
    {
      client_id: JENNI_CLIENT_ID,
      client_secret: JENNI_CLIENT_SECRET
    }
  );

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer
  
  return accessToken!;
}

export async function submitOrder(payload: JenniOrder) {
  const token = await getAccessToken();
  
  // Note: The new API doesn't seem to have an order submission endpoint
  // This would need to be updated once JENNi provides the order endpoint
  console.log("Order would be submitted:", payload);
  console.log("Using token:", token);
  
  // Placeholder - replace with actual order endpoint when available
  // await axios.post(`${JENNI_API_HOST}/api/sku-graph/product-availability-service/orders`, payload, {
  //   headers: { "Authorization": `Bearer ${token}` }
  // });
}
