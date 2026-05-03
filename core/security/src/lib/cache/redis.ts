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

    const url = config.redis.url;
    // rediss:// = TLS (e.g. cloud). redis:// = local / CI — do not force tls:{} or connection hangs.
    const useTls =
      url.startsWith("rediss://") || process.env.REDIS_TLS === "true";

    redisClient = new Redis(url, {
      ...(useTls ? { tls: {} } : {}),
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
