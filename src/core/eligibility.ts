import axios from "axios";
import Redis from "ioredis";
import pRetry from "p-retry";
import { EligibilityQuery, EligibilityResult, JenniTokenResponse } from "./types.js";
import { appConfig } from "../config.js";

// Optional Redis; fallback to in-memory cache if not configured
const redis: Redis | null = appConfig.redisUrl ? new Redis(appConfig.redisUrl) : null;
const memoryCache = new Map<string, { v: string; expireAt: number }>();

let accessToken: string | null = null;
let tokenExpiry = 0;
let tokenPromise: Promise<string> | null = null; // simple mutex to prevent token stampede

async function getAccessToken(): Promise<string> {
  if (!appConfig.jenni.enabled) {
    throw new Error('Jenni integration disabled');
  }
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const data = await pRetry(async () => {
        const res = await axios.post<JenniTokenResponse>(
          `${appConfig.jenni.apiHost}/api/sku-graph/product-availability-service/auth/token`,
          {
            client_id: appConfig.jenni.clientId,
            client_secret: appConfig.jenni.clientSecret
          }
        );
        return res.data;
      }, { retries: 3 });
      accessToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in * 1000) - 60_000; // buffer
      return accessToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

function cacheKey(q: EligibilityQuery) { return `elig:${q.gtin}:${q.zip}`; }

export async function checkEligibility(q: EligibilityQuery): Promise<EligibilityResult> {
  if (!appConfig.jenni.enabled) {
    return { eligible: false }; // gracefully degrade
  }
  const key = cacheKey(q);
  let cached: string | null = null;
  if (redis) {
    try { cached = await redis.get(key); } catch {}
  } else {
    const m = memoryCache.get(key); if (m && m.expireAt > Date.now()) cached = m.v;
  }
  if (cached) return JSON.parse(cached);

  const token = await getAccessToken();
  const { data } = await axios.post(
    `${appConfig.jenni.apiHost}/api/sku-graph/product-availability-service/searchProducts/`,
    { gtin: q.gtin, zip: q.zip, page: 1, page_size: 10 },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  let eligible = false; let minPrice: number | undefined;
  const products = data?.products || [];
  for (const product of products) {
    const variants = product?.variants || [];
    for (const variant of variants) {
      if (variant.gtin === q.gtin && variant.zipcode_inventory && variant.zipcode_inventory[q.zip]) {
        const inventory = parseInt(variant.zipcode_inventory[q.zip]);
        if (inventory > 0) {
          eligible = true;
          const priceNum = Number(variant.price);
            if (Number.isFinite(priceNum)) {
              minPrice = typeof minPrice === 'number' ? Math.min(minPrice, priceNum) : priceNum;
            }
        }
      }
    }
  }
  const result: EligibilityResult = { eligible };
  if (typeof minPrice === 'number') (result as any).minPrice = minPrice;
  const payload = JSON.stringify(result);
  if (redis) {
    try { await redis.set(key, payload, 'EX', 600); } catch {}
  } else {
    memoryCache.set(key, { v: payload, expireAt: Date.now() + 600_000 });
  }
  return result;
}
