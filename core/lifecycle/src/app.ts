import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "@/config";
import slaRoutes from "@/routes/sla.routes";

const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    service: "Lifecycle Service",
    status: "active",
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// SLA / availability metrics for research dashboard
app.use("/api/sla", slaRoutes);

export default app;
