// core/security/src/routes/did.routes.ts
import { Router, Request, Response } from "express";
import { didResolverService } from "../services/did-resolver.service";
import { ResolveDIDRequest } from "@shared/types";
import { log } from "@/lib/logger";

const router = Router();

/**
 * Resolve DID
 * POST /api/did/resolve
 *
 * Request Body:
 * {
 *   "did": "did:web:truganic.github.io:did-documents:clients:ci-automation-client"
 * }
 *
 * Response:
 * {
 *   "did": "did:web:...:client-1",
 *   "document": {
 *     "@context": "https://www.w3.org/2018/credentials/v1",
 *     "id": "did:web:...:client-1",
 *     "verificationMethod": [
 *       {
 *         "id": "did:web:...:client-1#keys-1",
 *         "type": "JsonWebKey2020",
 *         "controller": "did:web:...:client-1",
 *         "publicKeyJwk": {
 *           "kty": "EC",
 *           "crv": "P-256",
 *           "x": "...",
 *           "y": "..."
 *         }
 *       }
 *     ],
 *     "authentication": [
 *       "did:web:...:client-1#keys-1"
 *     ]
 *   },
 *   "resolved": true
 * }
 * OR
 * {
 *   "did": "did:web:...:client-1",
 *   "document": {},
 *   "resolved": false
 * }
 */
router.post("/resolve", async (req: Request, res: Response) => {
  try {
    const request: ResolveDIDRequest = req.body;

    if (!request.did) {
      return res.status(400).json({
        resolved: false,
        did: "",
        document: {} as any,
        error: "Missing required field: did",
      });
    }

    log.info("DID resolution request", { did: request.did });

    const result = await didResolverService.resolveDID(request);

    // Return appropriate status code
    if (result.resolved) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    log.error("DID resolution route error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      resolved: false,
      did: req.body.did || "",
      document: {} as any,
      error: error.message || "Failed to resolve DID",
    });
  }
});

/**
 * Invalidate DID cache
 * POST /api/did/invalidate
 *
 * Request Body:
 * {
 *   "did": "did:web:...:client-1"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "DID cache invalidated successfully",
 *   "did": "did:web:...:client-1"
 * }
 */
router.post("/invalidate", async (req: Request, res: Response) => {
  try {
    const { did } = req.body;

    if (!did) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: did",
      });
    }

    log.info("DID cache invalidation request", { did });

    await didResolverService.invalidateCache(did);

    res.json({
      success: true,
      message: "DID cache invalidated successfully",
      did,
    });
  } catch (error: any) {
    log.error("DID cache invalidation error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: error.message || "Failed to invalidate DID cache",
    });
  }
});

/**
 * Invalidate DID cache for multiple DIDs (e.g. after key rotation).
 * POST /api/did/invalidate-batch
 *
 * Request Body:
 * { "dids": ["did:web:...:core", "did:web:...:clients:farmer-client"] }
 */
router.post("/invalidate-batch", async (req: Request, res: Response) => {
  try {
    const { dids } = req.body;

    if (!Array.isArray(dids) || dids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or empty required field: dids (array of DID strings)",
      });
    }

    log.info("DID cache batch invalidation", { count: dids.length, dids });

    await Promise.all(dids.map((did: string) => didResolverService.invalidateCache(did)));

    res.json({
      success: true,
      message: "DID cache invalidated successfully",
      dids,
    });
  } catch (error: any) {
    log.error("DID cache batch invalidation error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: error.message || "Failed to invalidate DID cache",
    });
  }
});

export default router;
