import { Express } from "express";
import authRoutes from "@/routes/auth.routes";
import didRoutes from "@/routes/did.routes";
import vcRoutes from "@/routes/vc.routes";

/**
 * Register all routes with the Express app
 * @param app Express application instance
 */
export function setupRoutes(app: Express): void {
  // Authentication routes
  app.use("/api/auth", authRoutes);

  // DID routes
  app.use("/api/did", didRoutes);

  // Verifiable Credentials routes
  app.use("/api/vc", vcRoutes);
}

// Export individual routers for direct use if needed
export { default as authRoutes } from "./auth.routes";
export { default as didRoutes } from "./did.routes";
export { default as vcRoutes } from "./vc.routes";
