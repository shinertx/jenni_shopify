import fetch from "node-fetch";
import { JenniOrder } from "../core/types.js";

const { JENNI_ORDERS_URL, JENNI_API_KEY } = process.env;
const HTTP_CONFLICT = 409;

export async function submitOrder(payload: JenniOrder): Promise<{ ok: boolean; job_id?: string }> {
  if (!JENNI_ORDERS_URL || !JENNI_API_KEY) {
    throw new Error("Missing JENNI_ORDERS_URL or JENNI_API_KEY");
  }

  const res = await fetch(JENNI_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "JENNI_API_KEY": JENNI_API_KEY,
      "idempotency-key": payload.orderId
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (res.status === HTTP_CONFLICT) {
    try {
      const data = JSON.parse(text);
      return { ok: true, job_id: data.job_id };
    } catch {
      return { ok: true };
    }
  }

  if (!res.ok) {
    throw new Error(text);
  }

  try {
    const data = JSON.parse(text);
    return { ok: true, job_id: data.job_id };
  } catch {
    return { ok: true };
  }
}
