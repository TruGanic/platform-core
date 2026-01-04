// src/lib/logger/index.ts
import winston from "winston";
import path from "path";
import { config } from "@/config";

// Create logs directory
const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), "logs");

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (pretty for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "gateway-service" },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write errors to error.log
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (config.nodeEnv !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Helper methods for convenience
export const log = {
  info: (message: string, metadata?: any) => logger.info(message, metadata),
  warn: (message: string, metadata?: any) => logger.warn(message, metadata),
  error: (message: string, error?: Error | any, metadata?: any) => {
    if (error instanceof Error) {
      logger.error(message, {
        error: error.message,
        stack: error.stack,
        ...metadata,
      });
    } else {
      logger.error(message, { error, ...metadata });
    }
  },
  success: (message: string, metadata?: any) =>
    logger.info(`✓ ${message}`, metadata),
  failure: (message: string, error?: Error | any, metadata?: any) => {
    if (error instanceof Error) {
      logger.error(`✗ ${message}`, {
        error: error.message,
        stack: error.stack,
        ...metadata,
      });
    } else {
      logger.error(`✗ ${message}`, { error, ...metadata });
    }
  },
};
