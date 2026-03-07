import { Express } from "express";
import apiRoutes from "@/routes/api.routes";
import farmerRoutes from "@/routes/farmer.routes";
import agentsRoutes from "@/routes/agents.routes";

/**
 * Register all routes with the Express app
 * @param app Express application instance
 */
export function setupRoutes(app: Express): void {
  // API routes
  app.use("/api", apiRoutes);
  // Farmer API (zero-trust then forward to test-farmer-server)
  app.use("/api", farmerRoutes);
  // Agents API (zero-trust then forward to certification-body service)
  app.use("/api", agentsRoutes);
}

// Export individual routers for direct use if needed
export { default as apiRoutes } from "./api.routes";
