// core/gateway/src/middleware/authorize.middleware.ts
import { Request, Response, NextFunction } from "express";
import { SecurityClientService } from "../services/security-client.service";
import { AuthorizeRequest, AuthorizeResponse } from "@shared/types";
import { initRedis } from "@/lib/cache";
import { createHash } from "crypto";
import { config } from "@/config";
import { log } from "@/lib/logger";
import { pushAuditEntry } from "@/lib/audit";

// Initialize security client
const securityServiceUrl = config.securityServiceUrl;
const securityClient = new SecurityClientService(securityServiceUrl);

// Get Redis client (uses existing configuration)
const redis = initRedis();

// Cache configuration
const CACHE_TTL = parseInt(process.env.AUTHZ_CACHE_TTL || "300", 10); // 5 minutes default
const CACHE_ENABLED = process.env.AUTHZ_CACHE_ENABLED !== "false"; // Enabled by default

/**
 * Generate cache key from authorization request
 */
function generateCacheKey(
  did: string,
  action: string,
  resource: string
): string {
  // Normalize resource (remove query params, trailing slashes)
  const normalizedResource = resource.split("?")[0].replace(/\/$/, "");
  const keyString = `${did}:${action}:${normalizedResource}`;
  // Use hash to keep keys short
  return `authz:${createHash("sha256")
    .update(keyString)
    .digest("hex")
    .substring(0, 16)}`;
}

/**
 * Get cached authorization result
 */
async function getCachedResult(
  cacheKey: string
): Promise<AuthorizeResponse | null> {
  if (!CACHE_ENABLED) return null;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as AuthorizeResponse;
    }
  } catch (error: any) {
    log.warn("Authorization cache read error", { error: error.message });
  }

  return null;
}

/**
 * Cache authorization result
 */
async function cacheResult(
  cacheKey: string,
  result: AuthorizeResponse,
  did: string
): Promise<void> {
  if (!CACHE_ENABLED) return;

  try {
    // Cache in Redis with TTL
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    // Track cache key for this DID (for invalidation)
    // Store in a set: authz:did:{did}
    const didSetKey = `authz:did:${did}`;
    await redis.sadd(didSetKey, cacheKey);
    await redis.expire(didSetKey, CACHE_TTL);
  } catch (error: any) {
    log.warn("Authorization cache write error", { error: error.message });
  }
}

/**
 * Invalidate cache for a DID (when VC is revoked/updated)
 * Call this when you know a user's permissions have changed
 */
export async function invalidateAuthzCache(did: string): Promise<void> {
  try {
    const didSetKey = `authz:did:${did}`;

    // Get all cache keys for this DID
    const keys = await redis.smembers(didSetKey);

    if (keys.length > 0) {
      // Delete all cached authorization results for this DID
      await redis.del(...keys);
      log.info("Invalidated authorization cache", {
        did,
        keysCount: keys.length,
      });
    }

    // Delete the tracking set
    await redis.del(didSetKey);
  } catch (error: any) {
    log.warn("Authorization cache invalidation error", {
      error: error.message,
      did,
    });
  }
}

/**
 * Authorization middleware with caching - calls Security service
 *
 * This middleware:
 * 1. Extracts DID from authenticated request (must run after authMiddleware)
 * 2. Creates AuthorizeRequest from HTTP method and path
 * 3. Checks cache first (if enabled)
 * 4. Calls Security service /api/auth/authorize if not cached
 * 5. Caches the result for future requests
 * 6. Allows or denies based on response
 *
 * Usage:
 *   app.post('/api/servers/:serverId', authorizeMiddleware(), handler)
 *
 * Note: This middleware MUST be used after authMiddleware
 */
export function authorizeMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const did = (req as any).did;

      if (!did) {
        log.warn("Authorization failed: DID not found", {
          path: req.path,
          method: req.method,
        });
        pushAuditEntry({
          did: null,
          method: req.method,
          path: req.originalUrl || req.path,
          granted: false,
          reason: "DID not found",
          timestamp: new Date().toISOString(),
        });
        return res.status(401).json({
          error:
            "Unauthenticated - DID not found. Authentication must happen before authorization.",
        });
      }

      // Create AuthorizeRequest from HTTP request
      const authzRequest: AuthorizeRequest = {
        did,
        action: req.method, // "POST", "GET", "DELETE", etc.
        resource: req.path, // "/api/servers/demo-server-2"
        context: {
          ip: req.ip || (req.headers["x-forwarded-for"] as string) || "unknown",
          time: new Date().toISOString(),
          headers: req.headers as Record<string, string>,
        },
      };

      // Generate cache key
      const cacheKey = generateCacheKey(did, req.method, req.path);

      // Try to get from cache first
      let authzResponse: AuthorizeResponse | null = await getCachedResult(
        cacheKey
      );

      if (!authzResponse) {
        // Cache miss - call Security service
        log.info("Authorization cache miss, calling Security service", {
          did,
          action: req.method,
          resource: req.path,
        });

        authzResponse = await securityClient.authorizeRequest(authzRequest);

        // Cache the result (both authorized and denied results)
        await cacheResult(cacheKey, authzResponse, did);
      } else {
        // Cache hit
        log.info("Authorization cache hit", {
          did,
          action: req.method,
          resource: req.path,
        });
      }

      if (!authzResponse.authorized) {
        log.warn("Authorization denied", {
          did,
          action: req.method,
          resource: req.path,
          reason: authzResponse.reason,
        });
        pushAuditEntry({
          did,
          method: req.method,
          path: req.originalUrl || req.path,
          granted: false,
          reason: authzResponse.reason,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          error: "Insufficient permissions",
          reason: authzResponse.reason,
          action: req.method,
          resource: req.path,
        });
      }

      // Authorization successful - continue to route handler
      log.info("Authorization granted", {
        did,
        action: req.method,
        resource: req.path,
      });
      pushAuditEntry({
        did,
        method: req.method,
        path: req.originalUrl || req.path,
        granted: true,
        timestamp: new Date().toISOString(),
      });
      next();
    } catch (error: any) {
      log.error("Authorization middleware error", {
        error: error.message,
        stack: error.stack,
        path: req.path,
      });
      res.status(500).json({
        error: "Authorization error",
        message: error.message,
      });
    }
  };
}
