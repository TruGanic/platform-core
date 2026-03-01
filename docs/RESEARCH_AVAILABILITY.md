# Research Component: Improving System Availability (≈25%)

This document outlines a **research-oriented design** to increase platform availability and improve SLA-related metrics, using the **Registry** and **Lifecycle** services as the core. The approach is implementable and aligned with published work on availability, health monitoring, and SLA management.

---

## 1. Research Context & Motivation

- **Availability** is critical for supply-chain and API platforms; downtime or slow failure detection directly impacts SLA (e.g. uptime %, latency p99, error rate).
- Common problems in microservice systems:
  - **Slow failure detection**: Poll-based health checks detect failures only at the next probe (tuning-dependent); overly aggressive polling can cause false positives and reduce availability (e.g. [Roberts et al., “Signalling Health for Improved Kubernetes Microservice Availability”, 2025](https://arxiv.org/html/2507.02158v1)).
  - **Traffic to unhealthy instances**: If the gateway does not have an up-to-date view of instance health, it may still route to failed or degraded instances, increasing errors and latency.
  - **No explicit SLA visibility**: Without a central view of per-service/per-instance metrics, it is hard to measure or improve SLA (uptime, latency, error rate).

Your platform already has:
- **Registry**: Intended for plugin/service discovery and health tracking (PostgreSQL, ready for instance metadata).
- **Lifecycle**: Intended for canary deployments and metrics (Redis, good for fast metrics and coordination).
- **Gateway**: Single entry point; currently forwards to a fixed `farmerServiceUrl` with no instance selection.

The proposed research component ties these together in a **novel but practical** way: **signal-based health reporting + SLA-aware routing**, with **Lifecycle** used for metrics aggregation and canary coordination.

---

## 2. Proposed Idea: Signal-Based Health + SLA-Aware Routing

### 2.1 Core Concept

1. **Registry** = single source of truth for **service instances and their health**.
   - Services (or a lightweight “sidecar”/agent) **signal** health to the Registry (e.g. “I am healthy” / “I am degraded” / “I am shutting down”) instead of the gateway or orchestrator **polling** them.
   - This is analogous to **Signal-based Container Monitoring (SCM)** in the Glasgow paper: the entity that knows its state (here, the service) pushes updates, leading to faster and more accurate failure detection than periodic polling.
   - Registry stores: `instance_id`, `service_id`, `base_url`, `status` (e.g. healthy/degraded/unhealthy/draining), `last_signal_at`, optional `latency_p99`, `error_rate`, `version`.

2. **Gateway** = **SLA-aware routing**.
   - For each request to a “plugin” (e.g. farmer service), the Gateway **queries the Registry** for healthy instances of that service (and optionally prefers instances with better latency/error rate).
   - No traffic is sent to instances that Registry marks as unhealthy or draining → **improves effective availability and SLA** (fewer 5xx and timeouts).

3. **Lifecycle** = **metrics aggregation + canary coordination**.
   - **Metrics**: Periodically read from Registry (and optionally from services) to compute **SLA-relevant metrics**: e.g. per-service uptime, error rate, p99 latency. Store aggregates in Redis and expose them via a small API or dashboard (for research evaluation).
   - **Canary**: Coordinate canary rollout (e.g. register a “canary” instance, Gateway sends a small % of traffic to it; Lifecycle evaluates metrics and promotes or rolls back). This reduces availability impact of bad deployments.

### 2.2 Why This Is a Good Research Angle

- **Signal-based health**: You adapt the SCM idea from container orchestrators to the **application layer** (services → Registry), with a clear comparison possible: e.g. “time-to-detect-failure” and “false unhealthy” rate vs a poll-based baseline.
- **SLA improvement**: You can measure **SLA metrics** (uptime, p99, error rate) before and after:
  - Enabling Registry + signal-based health.
  - Enabling SLA-aware routing at the Gateway.
- **Uses your existing components**: Registry and Lifecycle get a clear, non-trivial role; the Gateway gains a small but impactful change (query Registry for targets).
- **Implementable**: No heavy ML or complex infra; you can implement with HTTP + DB + Redis and still produce meaningful results and comparisons.

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Clients                                                                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API Gateway                                                             │
│  • Auth / Authz (existing)                                               │
│  • SLA-aware routing: GET healthy instances from Registry → pick one     │
│  • Forward request to chosen instance                                    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Registry        │    │ Lifecycle           │    │ Plugin Services     │
│ • Register      │◄───│ • Scrape/aggregate  │    │ (e.g. Farmer)       │
│   instance      │    │   metrics from      │    │ • Signal health     │
│ • Heartbeat     │    │   Registry          │    │   to Registry       │
│   (signal)      │    │ • SLA metrics API   │    │   (e.g. every 5s)   │
│ • List healthy  │    │ • Canary state      │    │                     │
│   instances     │    │   (canary vs        │    │                     │
│ • PostgreSQL    │    │   stable)           │    │                     │
└─────────────────┘    │ • Redis             │    └─────────────────────┘
                       └─────────────────────┘
```

---

## 4. Implementation Outline (Enough to Build & Measure)

### 4.1 Registry Service

- **POST /api/instances/register**  
  Body: `{ serviceId, baseUrl, version?, metadata? }`  
  Returns: `{ instanceId }`.  
  Insert row in PostgreSQL: `instances(instance_id, service_id, base_url, status, last_signal_at, version, ...)` with `status = 'healthy'`, `last_signal_at = now()`.

- **POST /api/instances/:id/heartbeat** (signal)  
  Body: optional `{ status?, latencyP99?, errorRate? }`.  
  Update `last_signal_at`, optionally `status` and metrics.  
  This is the **signal**: the service pushes its state instead of being polled.

- **GET /api/instances?serviceId=X&healthyOnly=true**  
  Returns instances with `status = 'healthy'` (and optionally not expired: `last_signal_at` within last e.g. 15–30 s).  
  Gateway uses this for SLA-aware routing.

- **Optional**: TTL/cleanup: mark instances as unhealthy if `last_signal_at` is older than a threshold (e.g. 30 s).

### 4.2 Lifecycle Service

- **Metrics aggregation** (periodic job, e.g. every 30 s):
  - Read from Registry (or a small metrics API you add): per-instance `last_signal_at`, `status`, optional `latency_p99`, `error_rate`.
  - Compute per-service: uptime %, error rate, p99 (if you have data).
  - Store in Redis (e.g. `sla:service:<id>`) and/or expose **GET /api/sla/metrics**.

- **Canary coordination** (optional for v1):
  - Registry or Lifecycle stores “canary” vs “stable” for each service/version.
  - Gateway can use this to send e.g. 5% of traffic to canary instances; Lifecycle evaluates metrics and promotes/rolls back (manual or simple threshold rules).

### 4.3 Gateway

- For routes that proxy to a “plugin” (e.g. farmer):
  - Call Registry **GET /api/instances?serviceId=farmer&healthyOnly=true**.
  - If no healthy instances → 503.
  - Otherwise pick one (round-robin or “best” by latency/error rate if you have it).
  - Forward the request to that instance’s `base_url` (same path as now).
- Keep existing auth/authz unchanged.

### 4.4 Plugin Services (e.g. Farmer)

- On startup: **POST /api/instances/register** to Registry.
- Periodically (e.g. every 5 s): **POST /api/instances/:id/heartbeat** with optional `status` and metrics (if you expose `/metrics` or similar).
- On shutdown: optional **POST /api/instances/:id/heartbeat** with `status: 'draining'` or unregister.

---

## 5. What You Can Measure (Research / SLA)

- **Availability**: Uptime % of the API from the client’s perspective (e.g. Gateway returning 2xx vs 5xx/timeout).
- **Time to detect failure**: From the moment an instance dies to the moment Gateway stops routing to it (no heartbeat → Registry marks unhealthy or instance expires from healthy list). Compare with a **poll-based** baseline (Gateway or a separate poller polling each instance every N seconds).
- **False unhealthy rate**: With polling, transient latency can mark healthy instances as failed. With signal-based health, only the service declares itself unhealthy (or stops signalling); you can compare false removal from healthy set.
- **SLA metrics**: Per-service (or global) error rate, p99 latency, over a time window—before and after enabling Registry + SLA-aware routing.

You can present this as: “We improve availability and SLA by moving from poll-based to signal-based health reporting and by routing traffic only to healthy instances, using a central Registry and a Lifecycle service for metrics and canary.”

---

## 6. References (Short)

- Roberts, J., Archibald, B., Trinder, P. (2025). *Signalling Health for Improved Kubernetes Microservice Availability*. arXiv.  
  → Signal-based vs poll-based; 86% faster failure detection; 4% availability loss from erroneous poll-based failures.
- Trace-driven / proactive SLO management (e.g. Frontiers in Computer Science, 2026): using observability to predict SLO violations; your SLA metrics in Lifecycle are a first step toward such visibility.
- Hybrid reactive–proactive auto-scaling / SLA-constrained edge (e.g. arXiv 2512.14290): SLA-aware decisions; your Gateway’s “healthy-only” and optional “best instance” selection are in the same spirit.
- Canary analysis (e.g. Google CAS): compare canary vs control; your Lifecycle canary role supports that pattern.

---

## 7. Next Steps

1. **Registry**: Add DB schema for `instances`, implement register, heartbeat (signal), and list-healthy APIs.
2. **Gateway**: Add Registry client; for farmer (and later other plugins) resolve target from Registry and proxy to chosen healthy instance; 503 if none.
3. **Lifecycle**: Add periodic job to read Registry (and optionally plugin metrics), compute SLA metrics, store in Redis, expose `/api/sla/metrics`.
4. **Farmer (or one plugin)**: Add startup registration and periodic heartbeat to Registry.
5. **Experiments**: Run a small benchmark (e.g. kill an instance, measure time until Gateway stops routing to it; compare with a poll-based design). Report availability and SLA metrics before/after.

This gives you a **concrete, research-grounded, and implementable** availability/SLA component that uses Registry and Lifecycle in a “special and new” way as you wanted.
