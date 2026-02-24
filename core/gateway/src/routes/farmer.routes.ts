// core/gateway/src/routes/farmer.routes.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { authMiddleware, authorizeMiddleware } from "@/middleware";
import { config } from "@/config";
import { log } from "@/lib/logger";

const router = Router();
const farmerBase = config.farmerServiceUrl;

/**
 * Forward request to test-farmer-server after zero-trust auth + authz.
 * Requires VC permission write:farmer for POST, read:farmer for GET, etc.
 */
async function forwardToFarmerServer(req: Request, res: Response): Promise<void> {
  try {
    // Forward to same path on farmer service: /api/farmer/auth/...
    const targetPath = `/api${req.path}`;
    const url = `${farmerBase}${targetPath}`;
    const headers: Record<string, string> = {};
    ["content-type", "x-plugin-did", "x-signature", "x-timestamp", "x-nonce"].forEach(
      (h) => {
        const v = req.headers[h];
        if (v && typeof v === "string") headers[h] = v;
      }
    );

    const response = await axios({
      method: req.method,
      url,
      data: req.method !== "GET" ? req.body : undefined,
      headers,
      validateStatus: () => true,
    });

    res.status(response.status).json(response.data);
  } catch (err: unknown) {
    const e = err as { message?: string };
    log.error("Farmer service forward error", { error: e.message, path: req.path });
    res.status(502).json({
      success: false,
      error: "Farmer service unavailable",
      message: e.message,
    });
  }
}

// POST /api/farmer/auth/register – auth + authz then forward
router.post(
  "/farmer/auth/register",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);

export default router;
