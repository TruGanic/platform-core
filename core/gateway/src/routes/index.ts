import { Express } from "express";
import apiRoutes from "@/routes/api.routes";

/**
 * Register all routes with the Express app
 * @param app Express application instance
 */
export function setupRoutes(app: Express): void {
  // API routes
  app.use("/api", apiRoutes);
}

// Export individual routers for direct use if needed
export { default as apiRoutes } from "./api.routes";
