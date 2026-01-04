// core/security/src/routes/auth.routes.ts
import { Router, Request, Response } from "express";
import { authenticatorService } from "@/services/authenticator.service";
import { policyService } from "@/services/policy.service";
import { AuthenticateRequest, AuthorizeRequest } from "@shared/types";
import { log } from "@/lib/logger";

const router = Router();

/**
 * Authenticate request
 * POST /api/auth/authenticate
 *
 * Called by: Gateway authMiddleware
 *
 * Request Body:
 * {
 *   "did": "did:web:...:client-1",
 *   "signature": "base64-signature",
 *   "request": {
 *     "method": "POST",
 *     "path": "/api/plugins",
 *     "body": {...},
 *     "headers": {...},
 *     "timestamp": "2024-01-15T10:00:00Z",
 *     "nonce": "uuid-1234"
 *   }
 * }
 *
 * Response:
 * {
 *   "valid": true,
 *   "permissions": ["read:demo-server-1", "write:demo-server-2"]
 * }
 * OR
 * {
 *   "valid": false,
 *   "error": "Authentication failed reason"
 * }
 */
router.post("/authenticate", async (req: Request, res: Response) => {
  try {
    const request: AuthenticateRequest = req.body;

    // Validate required fields
    if (!request.did || !request.signature || !request.request) {
      log.warn("Authentication request missing required fields", {
        hasDid: !!request.did,
        hasSignature: !!request.signature,
        hasRequest: !!request.request,
      });
      return res.status(400).json({
        valid: false,
        error: "Missing required fields: did, signature, request",
      });
    }

    log.info("Authentication request received", {
      did: request.did,
      method: request.request.method,
      path: request.request.path,
    });

    const result = await authenticatorService.authenticateRequest(request);

    // Return appropriate status code
    if (result.valid) {
      log.info("Authentication successful", {
        did: request.did,
        permissionsCount: result.permissions?.length || 0,
      });
      res.status(200).json(result);
    } else {
      log.warn("Authentication failed", {
        did: request.did,
        error: result.error,
      });
      res.status(401).json(result);
    }
  } catch (error: any) {
    log.error("Authentication route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      valid: false,
      error: error.message || "Authentication failed",
    });
  }
});

/**
 * Authorize action
 * POST /api/auth/authorize
 *
 * Called by: Gateway authorizeMiddleware (with caching)
 *
 * Request Body:
 * {
 *   "did": "did:web:...:client-1",
 *   "action": "POST",
 *   "resource": "/api/servers/demo-server-2",
 *   "context": {
 *     "ip": "192.168.1.1",
 *     "time": "2024-01-15T10:00:00Z"
 *   }
 * }
 *
 * Response:
 * {
 *   "authorized": true
 * }
 * OR
 * {
 *   "authorized": false,
 *   "reason": "Missing required permission: write:demo-server-2"
 * }
 */
router.post("/authorize", async (req: Request, res: Response) => {
  try {
    const request: AuthorizeRequest = req.body;

    // Validate required fields
    if (!request.did || !request.action || !request.resource) {
      log.warn("Authorization request missing required fields", {
        hasDid: !!request.did,
        hasAction: !!request.action,
        hasResource: !!request.resource,
      });
      return res.status(400).json({
        authorized: false,
        reason: "Missing required fields: did, action, resource",
      });
    }

    log.info("Authorization request received", {
      did: request.did,
      action: request.action,
      resource: request.resource,
    });

    const result = await policyService.authorize(request);

    // Return appropriate status code
    if (result.authorized) {
      log.info("Authorization granted", {
        did: request.did,
        action: request.action,
        resource: request.resource,
      });
      res.status(200).json(result);
    } else {
      log.warn("Authorization denied", {
        did: request.did,
        action: request.action,
        resource: request.resource,
        reason: result.reason,
      });
      res.status(403).json(result);
    }
  } catch (error: any) {
    log.error("Authorization route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      authorized: false,
      reason: error.message || "Authorization failed",
    });
  }
});

export default router;
