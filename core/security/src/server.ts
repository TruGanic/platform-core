import app from "@/app";
import { config } from "@/config";
import { testConnection, closePool } from "@/lib/db";
import { initRedis, closeRedis } from "@/lib/cache";
import { log } from "@/lib/logger";

let server: any;

/**
 * Graceful Shutdown Logic
 * Stops the server, closes DB, and closes Redis
 */
const gracefulShutdown = async (signal: string) => {
  log.info(`${signal} received. Shutting down gracefully...`);

  // 1. Close the HTTP Server first (Stop accepting new requests)
  if (server) {
    server.close(() => {
      log.info("👋 HTTP server closed.");
    });
  }

  // 2. Close the Database connection
  await closePool();
  log.success("Security DB Connection closed.");

  // 3. Close the Redis connection
  await closeRedis();

  log.info("Shutdown complete.");
  process.exit(0);
};

/**
 * Start Server Logic
 */
async function startServer() {
  try {
    // 1. Connect to Database (PostgreSQL)
    log.info("🔄 Testing Security database connection...");

    const isConnected = await testConnection();
    if (!isConnected) {
      log.error("Security database connection failed");
      process.exit(1);
    }
    log.success("Security database connection successful");

    // 2. Connect to Cache (Redis)
    initRedis();

    // 3. Start the App
    server = app.listen(config.port, () => {
      log.info(`
      =========================================
      🚀 Security Service Started
      -----------------------------------------
      🔉 URL: http://localhost:${config.port}
      🌍 Env: ${config.nodeEnv}
      =========================================
      `);
    });

    // 4. Listen for Shutdown/Restart Signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
  } catch (error) {
    log.error("Failed to start Security server", error);
    process.exit(1);
  }
}

// Start the engine immediately
startServer();
