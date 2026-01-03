import Redis from "ioredis";
import { config } from "@/config";

let redisClient: Redis | null = null;

export const initRedis = (): Redis => {
  if (!redisClient) {
    console.log("🔄 Connecting to Lifecycle Redis...");

    if (!config.redis.url) {
      throw new Error("❌ REDIS_URL is missing in .env");
    }

    redisClient = new Redis(config.redis.url, {
      tls: {},
      keyPrefix: "lifecycle:",
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    redisClient.on("connect", () =>
      console.log("✅ Lifecycle Redis connected.")
    );
    redisClient.on("error", (err) => console.error("❌ Redis Error:", err));
  }
  return redisClient;
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log("✅ Lifecycle Redis closed.");
    redisClient = null;
  }
};
