// core/gateway/src/routes/farmer.routes.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { authMiddleware, authorizeMiddleware } from "@/middleware";
import { config } from "@/config";
import { log } from "@/lib/logger";

const router = Router();
const farmerBase = config.farmerServiceUrl;

/**
 * Forward request to farmer service after zero-trust auth + authz.
 * Requires VC permission write:farmer-server for POST/PATCH, read:farmer-server for GET.
 */
async function forwardToFarmerServer(req: Request, res: Response): Promise<void> {
  try {
    const targetPath = `/api${req.path}`;
    const url = `${farmerBase}${targetPath}`;
    const headers: Record<string, string> = {};
    [
      "content-type",
      "x-plugin-did",
      "x-signature",
      "x-timestamp",
      "x-nonce",
      "authorization",
    ].forEach((h) => {
      const v = req.headers[h];
      if (v && typeof v === "string") headers[h] = v;
    });

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

// Auth
router.post(
  "/farmer/auth/register",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.post(
  "/farmer/auth/login",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.post(
  "/farmer/auth/refresh",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);

// Logs
router.get(
  "/farmer/logs/recent",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.get(
  "/farmer/logs/history",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.post(
  "/farmer/logs/planting",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.post(
  "/farmer/logs/input",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.post(
  "/farmer/logs/harvest",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);
router.patch(
  "/farmer/logs/harvest/:id/transport",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToFarmerServer(req, res)
);

export default router;
