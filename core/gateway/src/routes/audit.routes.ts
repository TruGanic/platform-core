/**
 * Audit log API for dashboard. No auth required so dashboard backend can proxy.
 * Returns recent request audit entries (who, what, granted/denied) from Redis.
 */
import { Router, Request, Response } from "express";
import { getRedis } from "@/lib/cache";
import type { AuditEntry } from "@/lib/audit";

const router = Router();
const AUDIT_KEY = "audit:log";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

router.get("/audit/recent", async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(503).json({
        error: "Redis not available (Gateway may not have inited Redis yet; ensure REDIS_URL is set and a protected route was hit)",
        entries: [],
        timestamp: new Date().toISOString(),
      });
    }

    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT),
      MAX_LIMIT
    );
    const raw = await redis.lrange(AUDIT_KEY, 0, limit - 1);
    const entries: AuditEntry[] = raw
      .map((s) => {
        try {
          return JSON.parse(s) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AuditEntry[];

    res.json({
      entries,
      count: entries.length,
      timestamp: new Date().toISOString(),
      ...(entries.length === 0 && {
        hint: "Audit only records requests to protected routes (/api/farmer/*, /api/agents/*, /api/data). Check Gateway logs for 'Audit:' if Redis write fails.",
      }),
    });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
      entries: [],
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
