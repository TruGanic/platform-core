/**
 * Request audit log for dashboard visibility. Fire-and-forget; never blocks or throws into request path.
 * Stores last 500 entries in Redis (gateway:audit:log). Disabled if Redis unavailable.
 */
import { getRedis } from "@/lib/cache";

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
      if (!redis) return;
      const payload = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
      });
      redis
        .lpush(AUDIT_KEY, payload)
        .then(() => redis.ltrim(AUDIT_KEY, 0, AUDIT_MAX - 1))
        .catch(() => {});
    } catch {
      // no-op: never break request flow
    }
  });
}
