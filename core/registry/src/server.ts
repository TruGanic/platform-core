import app from "@/app";
import { config } from "@/config";
import { testConnection, closePool } from "@/lib/db";

let server: any;

/**
 * Graceful Shutdown Logic
 * Stops the server and closes the DB connection
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // 1. Close the HTTP Server first
  if (server) {
    server.close(() => {
      console.log("👋 Registry HTTP server closed.");
    });
  }

  // 2. Close the Database connection
  await closePool();
  console.log("✅ Registry DB Connection closed.");

  console.log("✅ Registry shutdown complete.");
  process.exit(0);
};

/**
 * Start Server Logic
 */
async function startServer() {
  try {
    console.log("🔄 Testing Registry database connection...");

    // 1. Connect to DB
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error("❌ Registry database connection failed");
      process.exit(1);
    }
    console.log("✅ Registry database connection successful");

    // 2. Start the App (Like your office code)
    server = app.listen(config.port, () => {
      console.log(`
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
    console.error("❌ Failed to start Registry server:", error);
    process.exit(1);
  }
}

// Start the engine immediately
startServer();
