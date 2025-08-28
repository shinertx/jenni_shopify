import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import pRetry from "p-retry";
import pino from "pino";
import { submitOrder } from "./core/order.js";

const logger = pino();

const redisOpts: any = { 
  maxRetriesPerRequest: null, // required by BullMQ
  retryStrategy: (times: number) => {
    // Retry connection every 5 seconds, up to 10 times
    if (times > 10) {
      console.error('Redis connection failed after 10 attempts');
      return null;
    }
    return Math.min(times * 500, 5000);
  }
};

let redis: Redis | null = null;
let orderQueue: Queue | any = null;
let worker: Worker | null = null;

const RETRY_CONFIG = {
  retries: 5,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 4000
};

// Initialize Redis connection
async function initRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log('Connecting to Redis at:', redisUrl);
    
    redis = new Redis(redisUrl, redisOpts);
    
    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });
    
    redis.on('error', (err: any) => {
      console.error('Redis Error:', err.message);
    });
    
    // Test the connection
    await redis.ping();
    
    // Create queue
    orderQueue = new Queue("orders", { connection: redis });
    console.log('✅ Order queue created');
    
    // Create worker with retry logic
    worker = new Worker(
      "orders",
      async (job: any) => {
        if (job.name === "forward-order") {
          await pRetry(() => submitOrder(job.data), RETRY_CONFIG);
          logger.info({ order_id: job.data.orderId }, 'Order processed successfully');
        } else {
          console.log('Processing order:', job.data.orderId);
          await submitOrder(job.data);
        }
      },
      { connection: redis }
    );
    console.log('✅ Order worker started');
    
    return true;
  } catch (error: any) {
    console.error('❌ Redis initialization failed:', error.message);
    console.log('⚠️  Running without queue support (orders will not be processed)');
    
    // Create dummy queue that logs but doesn't process
    orderQueue = { 
      add: async (name: string, data: any) => {
        console.log('Queue disabled - would have queued:', name, data);
        return { id: 'dummy' };
      }
    };
    
    return false;
  }
}

// Initialize on module load
initRedis().catch(console.error);

export { orderQueue, initRedis };
