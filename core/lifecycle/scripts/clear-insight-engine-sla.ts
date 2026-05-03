/**
 * Deletes only Redis SLA health samples for ML Insight Engine (insight-engine).
 * Same key prefix as Lifecycle Redis client. Run before/after changing INSIGHT_ENGINE_URL.
 */
import Redis from "ioredis";
import * as dotenv from "dotenv";
import { resolve } from "path";

const lifecycleRoot = resolve(__dirname, "..");
const platformCoreRoot = resolve(lifecycleRoot, "../..");
dotenv.config({ path: resolve(platformCoreRoot, ".env") });
dotenv.config({ path: resolve(lifecycleRoot, ".env"), override: true });

const INSIGHT_SLA_KEY = "sla:health:insight-engine";

async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is not set. Load platform-core or lifecycle .env first.");
    process.exit(1);
  }

  const redis = new Redis(url, {
    keyPrefix: "lifecycle:",
    tls: {},
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });

  const deleted = await redis.del(INSIGHT_SLA_KEY);
  await redis.quit();

  if (deleted === 1) {
    console.log("Removed ML Insight Engine SLA samples from Redis.");
  } else {
    console.log("No key to remove (already empty or wrong Redis).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
