import app from "@/app";
import { config } from "@/config";
import { testConnection, closePool } from "@/lib/db";
import { log } from "@/lib/logger";

let server: any;

/**
 * Graceful Shutdown Logic
 * Stops the server and closes the DB connection
 */
const gracefulShutdown = async (signal: string) => {
  log.info(`${signal} received. Shutting down gracefully...`);

  // 1. Close the HTTP Server first
  if (server) {
    server.close(() => {
      log.info("👋 Registry HTTP server closed.");
    });
  }

  // 2. Close the Database connection
  await closePool();
  log.success("Registry DB Connection closed.");

  log.success("Registry shutdown complete.");
  process.exit(0);
};

/**
 * Start Server Logic
 */
async function startServer() {
  try {
    log.info("🔄 Testing Registry database connection...");

    // 1. Connect to DB
    const isConnected = await testConnection();
    if (!isConnected) {
      log.error("Registry database connection failed");
      process.exit(1);
    }
    log.success("Registry database connection successful");

    // 2. Start the App (Like your office code)
    server = app.listen(config.port, () => {
      log.info(`
      =========================================
      🚀 Registry Service Started
      -----------------------------------------
      🔉 URL: http://localhost:${config.port}
      🌍 Env: ${config.nodeEnv}
      =========================================
      `);
    });

    // 3. Listen for Shutdown/Restart Signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
  } catch (error) {
    log.error("Failed to start Registry server", error);
    process.exit(1);
  }
}

// Start the engine immediately
startServer();
