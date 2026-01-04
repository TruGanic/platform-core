import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "@/config";
import { setupRoutes } from "@/routes";

const app = express();

// Standard Middleware
app.use(cors());
app.use(express.json());

// Health Check (public endpoint)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    service: "Gateway Service",
    status: "active",
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
    securityServiceUrl: config.securityServiceUrl,
  });
});

// API Routes
setupRoutes(app);

export default app;
