import app from "./app";
import { config } from "@/config";
import { initRedis, closeRedis } from "@/lib/cache";

let server: any;

const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down Gateway...`);
  if (server) {
    server.close(() => console.log("👋 Gateway HTTP server closed."));
  }
  await closeRedis();
  console.log("✅ Gateway shutdown complete.");
  process.exit(0);
};

async function startServer() {
  try {
    // 1. Start Redis
    initRedis();

    // 2. Start Server
    server = app.listen(config.port, () => {
      console.log(`
      =========================================
      🚀 API Gateway Started
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
    console.error("❌ Failed to start Gateway server:", error);
    process.exit(1);
  }
}

startServer();
