import * as dotenv from "dotenv";
import { resolve } from "path";

// 1. Load the .env file from the root directory
dotenv.config({ path: resolve(process.cwd(), ".env") });

// 2. define the environment (development, production, etc.)
const nodeEnv = process.env.NODE_ENV || "development";

// 3. Helper function to get a string variable (throws error if missing)
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

// 4. Helper function to get a number variable
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return parsed;
}

// 5. The Config Object
export const config = {
  nodeEnv: nodeEnv,
  port: getEnvNumber("PORT", 3001),

  redis: {
    url: getEnv("REDIS_URL"),
  },
};
