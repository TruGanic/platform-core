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
  port: getEnvNumber("PORT", 3003),

  redis: {
    url: getEnv("REDIS_URL"),
  },

  // URLs for health polling (SLA metrics). Same as Gateway so Lifecycle can measure platform availability.
  gatewayUrl: getEnv("GATEWAY_URL", "http://129.212.238.68:3000"),
  securityServiceUrl: getEnv("SECURITY_SERVICE_URL", "http://129.212.238.68:3001"),
  registryServiceUrl: getEnv("REGISTRY_SERVICE_URL", "http://129.212.238.68:3002"),
  lifecycleServiceUrl: getEnv("LIFECYCLE_SERVICE_URL", "http://129.212.238.68:3003"),
  dashboardBackendUrl: getEnv("DASHBOARD_BACKEND_URL", "http://129.212.238.68:3100"),
  farmerServiceUrl: getEnv("FARMER_SERVICE_URL", "https://truganic-farmer-app-2k88s.ondigitalocean.app"),
  certificationBodyServiceUrl: getEnv(
    "CERTIFICATION_BODY_SERVICE_URL",
    "https://truganic-certbody-app-r3ygv.ondigitalocean.app"
  ),
  insightEngineUrl: getEnv("INSIGHT_ENGINE_URL", "http://148.116.67.235:8081"),
  blockchainFarmerOrgUrl: getEnv("BLOCKCHAIN_FARMER_ORG_URL", "http://35.198.229.152:3000"),
  blockchainTransportOrgUrl: getEnv("BLOCKCHAIN_TRANSPORT_ORG_URL", "http://35.198.229.152:3001"),
  blockchainRetailerOrgUrl: getEnv("BLOCKCHAIN_RETAILER_ORG_URL", "http://35.198.229.152:3002"),
};
