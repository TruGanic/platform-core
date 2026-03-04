// core/security/src/routes/vc.routes.ts
import { Router, Request, Response } from "express";
import { vcIssuerService } from "../services/vc-issuer.service";
import { vcVerifierService } from "../services/vc-verifier.service";
import { auditService } from "../services/audit.service";
import { IssueVCRequest, VerifyVCRequest } from "@shared/types";
import { query, execute } from "@/lib/db";
import { log } from "@/lib/logger";

const router = Router();

/**
 * Issue VC
 * POST /api/vc/issue
 *
 * Request Body:
 * {
 *   "pluginId": "demo-plugin-1",
 *   "did": "did:web:...:client-1",
 *   "permissions": ["read:demo-server-1", "write:demo-server-2"],
 *   "version": "1.0.0", // optional
 *   "expirationDate": "2025-01-15T10:00:00Z" // optional
 * }
 */
router.post("/issue", async (req: Request, res: Response) => {
  try {
    const request: IssueVCRequest = req.body;

    // Validate required fields
    if (!request.pluginId || !request.did || !request.permissions) {
      return res.status(400).json({
        success: false,
        vc: {} as any,
        message: "Missing required fields: pluginId, did, permissions",
      });
    }

    // Validate permissions array
    if (
      !Array.isArray(request.permissions) ||
      request.permissions.length === 0
    ) {
      return res.status(400).json({
        success: false,
        vc: {} as any,
        message: "Permissions must be a non-empty array",
      });
    }

    log.info("VC issuance request", {
      pluginId: request.pluginId,
      did: request.did,
      permissionsCount: request.permissions.length,
    });

    const result = await vcIssuerService.issueVC(request);

    if (!result.success) {
      return res.status(500).json(result);
    }

    log.info("VC issued successfully", {
      did: request.did,
      pluginId: request.pluginId,
      vcId: result.vc.proof?.verificationMethod,
    });

    res.status(201).json(result);
  } catch (error: any) {
    log.error("VC issuance route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      vc: {} as any,
      message: error.message || "Failed to issue VC",
    });
  }
});

/**
 * Verify VC
 * POST /api/vc/verify
 *
 * Request Body:
 * {
 *   "vc": "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ..." // JWT string
 *   // OR
 *   "vc": {
 *     "issuer": "did:web:...:core-1",
 *     "credentialSubject": {
 *       "permissions": ["read:plugins", "write:instances", "delete:instances"]
 *     },
 *     "expirationDate": "2025-01-15T10:00:00Z"
 *   }
 * }
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const request: VerifyVCRequest = req.body;

    if (!request.vc) {
      return res.status(400).json({
        valid: false,
        error: "Missing required field: vc",
      });
    }

    log.info("VC verification request", {
      isJWT: typeof request.vc === "string",
    });

    const result = await vcVerifierService.verifyVC(request);

    // Return appropriate status code
    if (result.valid) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    log.error("VC verification route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      valid: false,
      error: error.message || "Failed to verify VC",
    });
  }
});

/**
 * Get current VC for a DID
 * GET /api/vc/current?did=...
 *
 * Returns the latest non-revoked, non-expired VC for the given DID.
 */
router.get("/current", async (req: Request, res: Response) => {
  try {
    const did = (req.query.did as string) || "";
    if (!did) {
      return res.status(400).json({
        success: false,
        message: "Missing required query parameter: did",
      });
    }

    const results = await query<{
      vc_id: string;
      jws: string;
      vc_data: any;
    }>(
      `
        SELECT vc_id, jws, vc_data
        FROM verifiable_credentials
        WHERE did = $1
          AND revoked = false
          AND (expiration_date IS NULL OR expiration_date > NOW())
        ORDER BY issuance_date DESC
        LIMIT 1
      `,
      [did]
    );

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active VC found for DID",
      });
    }

    const row = results[0];
    const vc = row.vc_data;
    const permissions = vc?.credentialSubject?.permissions || [];

    log.info("Fetched current VC for DID", {
      did,
      vcId: row.vc_id,
      hasJws: !!row.jws,
      permissionsCount: Array.isArray(permissions) ? permissions.length : 0,
    });

    return res.json({
      success: true,
      vc,
      permissions,
      vcId: row.vc_id,
      jws: row.jws,
    });
  } catch (error: any) {
    log.error("Get current VC route error", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch current VC",
    });
  }
});

/**
 * Revoke VC
 * POST /api/vc/revoke
 *
 * Request Body:
 * {
 *   "vcId": "uuid-or-jws-string",
 *   "reason": "Security breach" // optional
 * }
 */
router.post("/revoke", async (req: Request, res: Response) => {
  try {
    const { vcId, reason } = req.body;

    if (!vcId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: vcId",
      });
    }

    log.info("VC revocation request", { vcId });

    // Look up VC by vc_id or jws
    const lookupQuery = `
      SELECT vc_id, revoked, did
      FROM verifiable_credentials
      WHERE vc_id = $1 OR jws = $2
      LIMIT 1
    `;
    const lookupResult = await query<{
      vc_id: string;
      revoked: boolean;
      did: string;
    }>(lookupQuery, [vcId, vcId]);

    if (lookupResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "VC not found",
      });
    }

    const vc = lookupResult[0];
    if (vc.revoked) {
      return res.status(400).json({
        success: false,
        error: "VC is already revoked",
      });
    }

    // Update VC as revoked
    await execute(
      `
      UPDATE verifiable_credentials
      SET revoked = true,
          revoked_at = CURRENT_TIMESTAMP,
          revocation_reason = $1
      WHERE vc_id = $2
      `,
      [reason || "Revoked by administrator", vc.vc_id]
    );

    // Add to revocation list
    await execute(
      `
      INSERT INTO vc_revocation_list (vc_id, reason)
      VALUES ($1, $2)
      ON CONFLICT (vc_id) DO NOTHING
      `,
      [vc.vc_id, reason || "Revoked by administrator"]
    );

    // Log VC revocation
    const revokedBy = (req as any).did || "system";
    await auditService.logVCRevocation(
      vc.vc_id,
      reason || "Revoked by administrator",
      revokedBy
    );

    log.info("VC revoked successfully", {
      vcId: vc.vc_id,
      did: vc.did,
      revokedBy,
    });

    res.json({
      success: true,
      message: "VC revoked successfully",
      vcId: vc.vc_id,
    });
  } catch (error: any) {
    log.error("VC revocation route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: error.message || "Failed to revoke VC",
    });
  }
});

export default router;
