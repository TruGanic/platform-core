// core/gateway/src/routes/api.routes.ts
import { Router, Request, Response } from "express";
import {
  authMiddleware,
  authorizeMiddleware,
  authorizeLocalMiddleware,
} from "@/middleware";
import { log } from "@/lib/logger";

const router = Router();

/**
 * Example protected route demonstrating the full authentication and authorization flow
 *
 * This route:
 * 1. Requires authentication (via authMiddleware)
 * 2. Requires authorization (via authorizeMiddleware)
 * 3. Returns user information and permissions
 *
 * Request Headers Required:
 * - x-plugin-did: DID of the plugin/client
 * - x-signature: Cryptographic signature
 * - x-timestamp: Request timestamp
 * - x-nonce: Request nonce
 */

/**
 * Data endpoint - matches demo client expectations
 * GET /api/data - Read data (requires read:data permission)
 * POST /api/data - Write data (requires write:data permission)
 */
router.get(
  "/data",
  authMiddleware,
  authorizeMiddleware(),
  async (req: Request, res: Response) => {
    try {
      const did = (req as any).did;
      const permissions = (req as any).permissions || [];

      log.info("Data GET request", {
        did,
        permissionsCount: permissions.length,
      });

      res.json({
        success: true,
        message: "Data retrieved successfully",
        data: {
          message: "Hello from Gateway!",
          timestamp: new Date().toISOString(),
          user: {
            did,
            permissions,
          },
        },
      });
    } catch (error: any) {
      log.error("Data GET route error", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

router.post(
  "/data",
  authMiddleware,
  authorizeMiddleware(),
  async (req: Request, res: Response) => {
    try {
      const did = (req as any).did;
      const permissions = (req as any).permissions || [];
      const body = req.body;

      log.info("Data POST request", {
        did,
        permissionsCount: permissions.length,
        bodyKeys: Object.keys(body || {}),
      });

      res.json({
        success: true,
        message: "Data saved successfully",
        data: {
          received: body,
          timestamp: new Date().toISOString(),
          user: {
            did,
            permissions,
          },
        },
      });
    } catch (error: any) {
      log.error("Data POST route error", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

export default router;
