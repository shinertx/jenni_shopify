import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import pRetry from "p-retry";
import pino from "pino";
import { submitOrder } from "./core/order.js";

const connection = new Redis(process.env.REDIS_URL ?? "");
const logger = pino();

export const orderQueue = new Queue("orders", { connection });

const RETRY_CONFIG = {
  retries: 5,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 4000
};

new Worker(
  "orders",
  {
    "forward-order": async job => {
      await pRetry(() => submitOrder(job.data), RETRY_CONFIG);
      logger.info({ order_id: job.data.orderId });
    }
  },
  { connection }
);
