/**
 * Polls platform service health endpoints and stores results in Redis
 * for SLA/availability metrics. Runs every 30s. No change to Gateway or plugins.
 */
import type Redis from "ioredis";
import { config } from "@/config";
import { log } from "@/lib/logger";

const POLL_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 100_000; // ~35 days window: 1 failed poll still shows 99.999%
const HEALTH_PATH = "/health";

interface PollTarget {
  id: string;
  label: string;
  url: string;
}

function getTargets(): PollTarget[] {
  // Order: core platform (entry → auth → discovery → orchestration) → business services → blockchain orgs
  return [
    { id: "gateway", label: "API Gateway", url: `${config.gatewayUrl}${HEALTH_PATH}` },
    { id: "security", label: "Security Service", url: `${config.securityServiceUrl}${HEALTH_PATH}` },
    { id: "registry", label: "Registry Service", url: `${config.registryServiceUrl}${HEALTH_PATH}` },
    { id: "lifecycle", label: "Lifecycle Service", url: `${config.lifecycleServiceUrl}${HEALTH_PATH}` },
    {
      id: "dashboard-backend",
      label: "Security Admin Dashboard Backend",
      url: `${config.dashboardBackendUrl}${HEALTH_PATH}`,
    },
    {
      id: "certification-body",
      label: "Certification Body Service",
      url: `${config.certificationBodyServiceUrl}/api/agents/health`,
    },
    { id: "farmer", label: "Farmer Service", url: `${config.farmerServiceUrl}/api/farmer/health` },
    {
      id: "insight-engine",
      label: "ML Insight Engine",
      url: `${config.insightEngineUrl}/health`,
    },
    {
      id: "blockchain-farmer-org",
      label: "Blockchain Farmer Organization",
      url: `${config.blockchainFarmerOrgUrl}/api/health`,
    },
    {
      id: "blockchain-transport-org",
      label: "Blockchain Transport Agent Organization",
      url: `${config.blockchainTransportOrgUrl}/api/health`,
    },
    {
      id: "blockchain-retailer-org",
      label: "Blockchain Retailer Organization",
      url: `${config.blockchainRetailerOrgUrl}/api/health`,
    },
  ];
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function slaKey(serviceId: string): string {
  return `sla:health:${serviceId}`;
}

export function startHealthPoller(redis: Redis): void {
  const targets = getTargets();

  const poll = async () => {
    const now = Date.now();
    for (const t of targets) {
      try {
        const ok = await checkHealth(t.url);
        const payload = JSON.stringify({ ok, ts: now });
        await redis.lpush(slaKey(t.id), payload);
        await redis.ltrim(slaKey(t.id), 0, MAX_SAMPLES - 1);
      } catch (err) {
        log.warn("Health poll error", { serviceId: t.id, error: (err as Error).message });
      }
    }
  };

  poll();
  const interval = setInterval(poll, POLL_INTERVAL_MS);
  log.info("SLA health poller started", { intervalMs: POLL_INTERVAL_MS, services: targets.map((t) => t.id) });

  // Allow cleanup on shutdown (caller can store interval and clear it)
  if (typeof (global as any).__lifecycleHealthPollerInterval !== "undefined") {
    clearInterval((global as any).__lifecycleHealthPollerInterval);
  }
  (global as any).__lifecycleHealthPollerInterval = interval;
}
