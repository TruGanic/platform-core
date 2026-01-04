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
 * - x-timestamp: Request timestamp (optional, auto-generated)
 * - x-nonce: Request nonce (optional, auto-generated)
 * 
 * Example:
 * GET /api/demo
 * Headers:
 *   x-plugin-did: did:web:example.com:plugin-1
 *   x-signature: <base64-signature>
 */
router.get(
  "/demo",
  authMiddleware, // First: Authenticate the request
  authorizeMiddleware(), // Second: Check permissions
  async (req: Request, res: Response) => {
    try {
      const did = (req as any).did;
      const permissions = (req as any).permissions || [];

      log.info("Demo route accessed", {
        did,
        permissionsCount: permissions.length,
      });

      res.json({
        success: true,
        message: "Successfully authenticated and authorized!",
        user: {
          did,
          permissions,
        },
        request: {
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      log.error("Demo route error", {
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

/**
 * Example route with local authorization (checks permissions locally)
 * This avoids the extra HTTP call to Security Service but loses centralized audit logging
 */
router.get(
  "/demo-local",
  authMiddleware, // Authenticate first
  authorizeLocalMiddleware("read:demo"), // Check permission locally
  async (req: Request, res: Response) => {
    const did = (req as any).did;
    const permissions = (req as any).permissions || [];

    res.json({
      success: true,
      message: "Local authorization successful!",
      user: {
        did,
        permissions,
      },
    });
  }
);

/**
 * Data endpoint - matches demo client expectations
 * GET /api/data - Read data (requires read:data permission)
 * POST /api/data - Write data (requires write:data permission)
 */
router.get(
  "/data",
  authMiddleware, // Authenticate first
  authorizeMiddleware(), // Check permissions via Security Service
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
  authMiddleware, // Authenticate first
  authorizeMiddleware(), // Check permissions via Security Service
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

/**
 * Public route (no authentication required)
 * Useful for health checks, public APIs, etc.
 */
router.get("/public", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "This is a public endpoint - no authentication required",
    timestamp: new Date().toISOString(),
  });
});

export default router;

