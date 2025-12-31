/**
 * Deployment Types
 */

export interface DeploymentConfig {
  environment: string;
  region?: string;
  [key: string]: any;
}
