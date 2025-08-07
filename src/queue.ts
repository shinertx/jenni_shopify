import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { submitOrder } from "./core/order.js";

const connection = new Redis(process.env.REDIS_URL ?? "");

export const orderQueue = new Queue("orders", { connection });

new Worker(
  "orders",
  async job => {
    await submitOrder(job.data);
  },
  { connection }
);
