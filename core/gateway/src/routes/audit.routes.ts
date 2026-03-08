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

/** Aggregate counts from audit entries (methods + granted/denied) */
function aggregateAuditStats(entries: AuditEntry[]): {
  totalRequests: number;
  get: number;
  post: number;
  put: number;
  patch: number;
  delete: number;
  other: number;
  granted: number;
  denied: number;
} {
  const methods: Record<string, number> = { get: 0, post: 0, put: 0, patch: 0, delete: 0, other: 0 };
  let granted = 0;
  let denied = 0;
  for (const e of entries) {
    const m = (e.method || "").toUpperCase();
    if (m === "GET") methods.get++;
    else if (m === "POST") methods.post++;
    else if (m === "PUT") methods.put++;
    else if (m === "PATCH") methods.patch++;
    else if (m === "DELETE") methods.delete++;
    else methods.other++;
    if (e.granted) granted++;
    else denied++;
  }
  return {
    totalRequests: entries.length,
    get: methods.get,
    post: methods.post,
    put: methods.put,
    patch: methods.patch,
    delete: methods.delete,
    other: methods.other,
    granted,
    denied,
  };
}

/** GET /api/audit/stats - aggregated counts for dashboard overview */
router.get("/audit/stats", async (_req: Request, res: Response) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(503).json({
        error: "Redis not available",
        totalRequests: 0,
        get: 0,
        post: 0,
        put: 0,
        patch: 0,
        delete: 0,
        other: 0,
        granted: 0,
        denied: 0,
        timestamp: new Date().toISOString(),
      });
    }
    const raw = await redis.lrange(AUDIT_KEY, 0, -1);
    const entries: AuditEntry[] = raw
      .map((s) => {
        try {
          return JSON.parse(s) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AuditEntry[];
    const stats = aggregateAuditStats(entries);
    res.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
      totalRequests: 0,
      get: 0,
      post: 0,
      put: 0,
      patch: 0,
      delete: 0,
      other: 0,
      granted: 0,
      denied: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/audit/recent", async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(503).json({
        error: "Redis not available (Gateway may not have inited Redis yet; ensure REDIS_URL is set and a protected route was hit)",
        entries: [],
        total: 0,
        page: 1,
        limit: DEFAULT_LIMIT,
        totalPages: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT),
      MAX_LIMIT
    );
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const offset = (page - 1) * limit;

    const total = await redis.llen(AUDIT_KEY);
    const raw = await redis.lrange(AUDIT_KEY, offset, offset + limit - 1);
    const entries: AuditEntry[] = raw
      .map((s) => {
        try {
          return JSON.parse(s) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AuditEntry[];

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      entries,
      count: entries.length,
      total,
      page,
      limit,
      totalPages,
      timestamp: new Date().toISOString(),
      ...(entries.length === 0 && total === 0 && {
        hint: "Audit only records requests to protected routes (/api/farmer/*, /api/agents/*, /api/data). Check Gateway logs for 'Audit:' if Redis write fails.",
      }),
    });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
      entries: [],
      total: 0,
      page: 1,
      limit: DEFAULT_LIMIT,
      totalPages: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
