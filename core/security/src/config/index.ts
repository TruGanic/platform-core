import * as dotenv from "dotenv";
import { resolve } from "path";

// 1. Get paths relative to THIS file's location
const configDir = __dirname;
const serviceRoot = resolve(configDir, "../../");
const projectRoot = resolve(serviceRoot, "../..");

// 2. Load the .env file from the root directory
dotenv.config({ path: resolve(projectRoot, ".env"), override: true });

// 3. Load the .env file from the service directory
dotenv.config({ path: resolve(serviceRoot, ".env"), override: true });

// 4. define the environment (development, production, etc.)
const nodeEnv = process.env.NODE_ENV;

// 5. Helper function to get a string variable (throws error if missing)
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

// 6. Helper function to get a number variable
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return parsed;
}

// 7. The Config Object
export const config = {
  nodeEnv: nodeEnv,
  port: getEnvNumber("PORT", 3001),

  database: {
    host: getEnv("DB_HOST"),
    port: getEnvNumber("DB_PORT", 5432),
    user: getEnv("DB_USER"),
    password: getEnv("DB_PASSWORD"),
    database: getEnv("DB_NAME"),
  },

  redis: {
    url: getEnv("REDIS_URL"),
  },

  corePrivateKey: getEnv("CORE_PRIVATE_KEY"),
};
