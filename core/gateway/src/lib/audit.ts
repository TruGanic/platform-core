/**
 * Request audit log for dashboard visibility. Fire-and-forget; never blocks or throws into request path.
 * Stores last 500 entries in Redis (gateway:audit:log). Disabled if Redis unavailable.
 * Only requests that hit auth + authorize middleware are logged (e.g. /api/farmer/*, /api/agents/*, /api/data).
 */
import { getRedis } from "@/lib/cache";
import { log } from "@/lib/logger";

const AUDIT_KEY = "audit:log";
const AUDIT_MAX = 500;

export interface AuditEntry {
  did: string | null;
  method: string;
  path: string;
  granted: boolean;
  reason?: string;
  timestamp: string;
}

export function pushAuditEntry(entry: AuditEntry): void {
  setImmediate(() => {
    try {
      const redis = getRedis();
      if (!redis) {
        log.warn("Audit: Redis not available (getRedis null), entry not stored", {
          path: entry.path,
          method: entry.method,
        });
        return;
      }
      const payload = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
      });
      redis
        .lpush(AUDIT_KEY, payload)
        .then(() => redis.ltrim(AUDIT_KEY, 0, AUDIT_MAX - 1))
        .catch((err) => {
          log.warn("Audit: Redis write failed, entry not stored", {
            path: entry.path,
            error: (err as Error).message,
          });
        });
    } catch (err) {
      log.warn("Audit: push failed", { path: entry.path, error: (err as Error).message });
    }
  });
}
