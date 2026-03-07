// core/gateway/src/routes/agents.routes.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { authMiddleware, authorizeMiddleware } from "@/middleware";
import { config } from "@/config";
import { log } from "@/lib/logger";

const router = Router();
const certBodyBase = config.certificationBodyServiceUrl;

/**
 * Forward request to certification-body service after zero-trust auth + authz.
 * Requires VC permission write:certification-body-server for POST, read:certification-body-server for GET.
 */
async function forwardToCertBodyServer(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const targetPath = `/api${req.path}`;
    const url = `${certBodyBase}${targetPath}`;
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
    log.error("Certification body service forward error", {
      error: e.message,
      path: req.path,
    });
    res.status(502).json({
      success: false,
      error: "Certification body service unavailable",
      message: e.message,
    });
  }
}

// POST /api/agents/register – auth + authz then forward
router.post(
  "/agents/register",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToCertBodyServer(req, res)
);

// POST /api/agents/login – auth + authz then forward
router.post(
  "/agents/login",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToCertBodyServer(req, res)
);

// POST /api/agents/logout – auth + authz then forward
router.post(
  "/agents/logout",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToCertBodyServer(req, res)
);

// GET /api/agents/dashboard-stats – auth + authz then forward
router.get(
  "/agents/dashboard-stats",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToCertBodyServer(req, res)
);

// GET /api/agents/inspection-report/:batchId – auth + authz then forward
router.get(
  "/agents/inspection-report/:batchId",
  authMiddleware,
  authorizeMiddleware(),
  (req: Request, res: Response) => forwardToCertBodyServer(req, res)
);

export default router;
