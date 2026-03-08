import { Router, Request, Response } from "express";
import { getRedis } from "@/lib/cache";

const router = Router();
const MAX_SAMPLES = 100_000; // must match health-poller (~35 days for 99.999% with 1 blip)

function slaKey(serviceId: string): string {
  return `sla:health:${serviceId}`;
}

const SERVICE_LABELS: Record<string, string> = {
  gateway: "API Gateway",
  security: "Security Service",
  registry: "Registry Service",
  lifecycle: "Lifecycle Service",
  "dashboard-backend": "Security Admin Dashboard Backend",
  "certification-body": "Certification Body Service",
  farmer: "Farmer Service",
  "insight-engine": "ML Insight Engine",
  "blockchain-farmer-org": "Blockchain Farmer Organization",
  "blockchain-transport-org": "Blockchain Transport Agent Organization",
  "blockchain-retailer-org": "Blockchain Retailer Organization",
};

/**
 * GET /api/sla/metrics
 * Returns SLA/availability metrics for research dashboard.
 * Data is populated by the health poller (no Gateway or plugin code changes).
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(503).json({
        error: "Redis not available",
        services: [],
        timestamp: new Date().toISOString(),
      });
    }

    const serviceIds = [
      "gateway",
      "security",
      "registry",
      "lifecycle",
      "dashboard-backend",
      "certification-body",
      "farmer",
      "insight-engine",
      "blockchain-farmer-org",
      "blockchain-transport-org",
      "blockchain-retailer-org",
    ];
    const services: {
      id: string;
      label: string;
      uptimePercent: number;
      lastChecked: string | null;
      status: "up" | "down" | "unknown";
      samples: number;
    }[] = [];

    for (const id of serviceIds) {
      const raw = await redis.lrange(slaKey(id), 0, MAX_SAMPLES - 1);
      const samples = raw.map((s) => {
        try {
          return JSON.parse(s) as { ok: boolean; ts: number };
        } catch {
          return null;
        }
      }).filter(Boolean) as { ok: boolean; ts: number }[];

      const okCount = samples.filter((s) => s.ok).length;
      const uptimePercent =
        samples.length > 0 ? Math.round((okCount / samples.length) * 100 * 1000) / 1000 : 0;
      const last = samples[0];
      const lastChecked = last ? new Date(last.ts).toISOString() : null;
      const status = samples.length === 0 ? "unknown" : last?.ok ? "up" : "down";

      services.push({
        id,
        label: SERVICE_LABELS[id] || id,
        uptimePercent,
        lastChecked,
        status,
        samples: samples.length,
      });
    }

    const platformUptime =
      services.filter((s) => s.samples > 0).length > 0
        ? Math.round(
            (services.reduce((sum, s) => sum + s.uptimePercent, 0) /
              services.filter((s) => s.samples > 0).length) *
              1000
          ) / 1000
        : 0;

    res.json({
      services,
      platformUptimePercent: platformUptime,
      timestamp: new Date().toISOString(),
      windowMinutes: Math.floor((MAX_SAMPLES * 30) / 60),
    });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
      services: [],
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
