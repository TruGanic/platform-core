import Redis from "ioredis";
import { config } from "@/config";
import { log } from "@/lib/logger";

let redisClient: Redis | null = null;

export const initRedis = (): Redis => {
  if (!redisClient) {
    log.info("🔄 Connecting to Security Redis...");

    if (!config.redis.url) {
      throw new Error("❌ REDIS_URL is missing in .env");
    }

    redisClient = new Redis(config.redis.url, {
      tls: {},
      keyPrefix: "security:",
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    redisClient.on("connect", () =>
      log.success("Security Redis connected.")
    );
    redisClient.on("error", (err) => log.error("Redis Error", err));
  }
  return redisClient;
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    log.success("Security Redis closed.");
    redisClient = null;
  }
};
