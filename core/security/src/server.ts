import app from "@/app";
import { config } from "@/config";
import { testConnection, closePool } from "@/lib/db";
import { initRedis, closeRedis } from "@/lib/cache";

let server: any;

/**
 * Graceful Shutdown Logic
 * Stops the server, closes DB, and closes Redis
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // 1. Close the HTTP Server first (Stop accepting new requests)
  if (server) {
    server.close(() => {
      console.log("👋 HTTP server closed.");
    });
  }

  // 2. Close the Database connection
  await closePool();
  console.log("✅ Security DB Connection closed.");

  // 3. Close the Redis connection
  await closeRedis();

  console.log("Shutdown complete.");
  process.exit(0);
};

/**
 * Start Server Logic
 */
async function startServer() {
  try {
    // 1. Connect to Database (PostgreSQL)
    console.log("🔄 Testing Security database connection...");

    const isConnected = await testConnection();
    if (!isConnected) {
      console.error("❌ Security database connection failed");
      process.exit(1);
    }
    console.log("✅ Security database connection successful");

    // 2. Connect to Cache (Redis)
    initRedis();

    // 3. Start the App
    server = app.listen(config.port, () => {
      console.log(`
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
    console.error("❌ Failed to start Security server:", error);
    process.exit(1);
  }
}

// Start the engine immediately
startServer();
