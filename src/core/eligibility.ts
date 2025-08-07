import axios from "axios";
import Redis from "ioredis";
import { EligibilityQuery, EligibilityResult } from "./types.js";

const { JENNI_API_KEY, JENNI_API_HOST, REDIS_URL } = process.env;
const redis = new Redis(REDIS_URL ?? "");

function cacheKey(q: EligibilityQuery) {
  return `elig:${q.upc}:${q.zip}`;
}

export async function checkEligibility(q: EligibilityQuery): Promise<EligibilityResult> {
  const key = cacheKey(q);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const { data } = await axios.get(`${JENNI_API_HOST}/v1/search`, {
    params: q,
    headers: { "x-api-key": JENNI_API_KEY }
  });

  await redis.set(key, JSON.stringify(data), "EX", 600); // 10m
  return data as EligibilityResult;
}
