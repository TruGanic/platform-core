// core/gateway/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import { SecurityClientService } from "../services/security-client.service";
import { AuthenticateRequest } from "@shared/types";
import { config } from "@/config";
import { log } from "@/lib/logger";

// Initialize security client
const securityServiceUrl = config.securityServiceUrl;
const securityClient = new SecurityClientService(securityServiceUrl);

// Feature flag for development mode (default: true - authentication required)
const AUTH_REQUIRED = config.authRequired !== "false";

/**
 * Authentication middleware for zero-trust security
 *
 * This middleware:
 * 1. Extracts DID and signature from request headers
 * 2. Validates required headers are present
 * 3. Calls Security Service to authenticate the request
 * 4. Adds permissions and DID to request object for downstream use
 *
 * Required Headers:
 * - x-plugin-did: The DID of the plugin/client making the request
 * - x-signature: Cryptographic signature of the request
 * - x-timestamp: Request timestamp (required for signature verification)
 * - x-nonce: Request nonce (required for signature verification)
 *
 * Optional Headers:
 * - x-request-id: Request ID for tracking
 *
 * After successful authentication:
 * - req.did: The authenticated DID
 * - req.permissions: Array of permissions from the VC
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract required headers
    const did = req.headers["x-plugin-did"] as string;
    const signature = req.headers["x-signature"] as string;
    const timestamp = req.headers["x-timestamp"] as string;
    const nonce = req.headers["x-nonce"] as string;

    // If AUTH_REQUIRED is false, allow bypass in development mode
    if (!AUTH_REQUIRED && config.nodeEnv === "development") {
      log.warn(
        "⚠️  WARNING: Allowing unauthenticated request in development mode",
        {
          path: req.path,
        }
      );
      return next();
    }

    // Validate all required headers are present
    if (!did || !signature || !nonce || !timestamp) {
      log.warn("Authentication failed: missing required headers", {
        hasDid: !!did,
        hasSignature: !!signature,
        hasNonce: !!nonce,
        hasTimestamp: !!timestamp,
        path: req.path,
      });
      return res.status(401).json({
        error:
          "Missing required headers: x-plugin-did, x-signature, x-nonce, and x-timestamp are required",
      });
    }

    // Prepare authentication request
    const authRequest: AuthenticateRequest = {
      did,
      signature,
      request: {
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers as Record<string, string>,
        timestamp: timestamp,
        nonce: nonce,
      },
    };

    log.info("Authenticating request", {
      did,
      method: req.method,
      path: req.path,
      hasNonce: !!nonce,
      hasTimestamp: !!timestamp,
    });

    // Authenticate with security service
    const authResponse = await securityClient.authenticateRequest(authRequest);

    if (!authResponse.valid) {
      log.warn("Authentication failed", {
        did,
        error: authResponse.error,
        path: req.path,
      });
      return res.status(401).json({
        error: authResponse.error || "Authentication failed",
      });
    }

    // Add permissions to request object for later use
    (req as any).permissions = authResponse.permissions || [];
    (req as any).did = did;

    log.info("Authentication successful", {
      did,
      permissionsCount: authResponse.permissions?.length || 0,
      path: req.path,
    });

    next();
  } catch (error: any) {
    log.error("Auth middleware error", {
      error: error.message,
      stack: error.stack,
      path: req.path,
    });
    res.status(500).json({
      error: "Authentication error",
      message: error.message,
    });
  }
}
