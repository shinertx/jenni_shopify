import axios from "axios";
import { JenniOrder } from "./types.js";
const { JENNI_API_KEY, JENNI_API_HOST } = process.env;

export async function submitOrder(payload: JenniOrder) {
  await axios.post(`${JENNI_API_HOST}/v1/order`, payload, {
    headers: { "x-api-key": JENNI_API_KEY }
  });
}
