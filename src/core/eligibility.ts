import axios from "axios";
import Redis from "ioredis";
import { EligibilityQuery, EligibilityResult, JenniTokenResponse } from "./types.js";

const { JENNI_CLIENT_ID, JENNI_CLIENT_SECRET, JENNI_API_HOST, REDIS_URL } = process.env;
const redis = new Redis(REDIS_URL ?? "");

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

function cacheKey(q: EligibilityQuery) {
  return `elig:${q.gtin}:${q.zip}`;
}

export async function checkEligibility(q: EligibilityQuery): Promise<EligibilityResult> {
  const key = cacheKey(q);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const token = await getAccessToken();
  
  const { data } = await axios.post(
    `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
    {
      gtin: q.gtin,
      zip: q.zip,
      page: 1,
      page_size: 10
    },
    {
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  // Check if any variants have inventory in the requested zip code
  let eligible = false;
  if (data.products && data.products.length > 0) {
    for (const product of data.products) {
      for (const variant of product.variants) {
        if (variant.gtin === q.gtin && variant.zipcode_inventory && variant.zipcode_inventory[q.zip]) {
          const inventory = parseInt(variant.zipcode_inventory[q.zip]);
          if (inventory > 0) {
            eligible = true;
            break;
          }
        }
      }
      if (eligible) break;
    }
  }

  const result: EligibilityResult = { eligible };
  await redis.set(key, JSON.stringify(result), "EX", 600); // 10m
  return result;
}
