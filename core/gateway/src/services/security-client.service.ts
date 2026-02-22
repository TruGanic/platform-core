// core/gateway/src/services/security-client.service.ts
import axios, { AxiosInstance } from "axios";
import {
  AuthenticateRequest,
  AuthenticateResponse,
  AuthorizeRequest,
  AuthorizeResponse,
} from "@shared/types";
import { log } from "@/lib/logger";

export class SecurityClientService {
  private axiosInstance: AxiosInstance;

  constructor(securityServiceUrl: string) {
    // Create axios instance with timeout and error handling
    this.axiosInstance = axios.create({
      baseURL: securityServiceUrl,
      timeout: 10000, // 10 seconds
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        log.error("Security service request error", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate request
   * Calls Security service /api/auth/authenticate endpoint
   */
  async authenticateRequest(
    request: AuthenticateRequest
  ): Promise<AuthenticateResponse> {
    try {
      const response = await this.axiosInstance.post<AuthenticateResponse>(
        "/api/auth/authenticate",
        request
      );
      return response.data;
    } catch (error: any) {
      log.error("Security service authentication error", {
        error: error.message,
        did: request.did,
      });

      // Handle different error types
      if (error.response) {
        // Security service returned an error response
        return {
          valid: false,
          error:
            error.response.data?.error ||
            `Authentication failed: ${error.response.status}`,
        };
      } else if (error.request) {
        // Request was made but no response received
        return {
          valid: false,
          error: "Security service is unavailable",
        };
      } else {
        // Error in request setup
        return {
          valid: false,
          error: error.message || "Authentication failed",
        };
      }
    }
  }

  /**
   * Authorize action
   * Calls Security service /api/auth/authorize endpoint
   * Checks if user has permission for action/resource
   */
  async authorizeRequest(
    request: AuthorizeRequest
  ): Promise<AuthorizeResponse> {
    try {
      const response = await this.axiosInstance.post<AuthorizeResponse>(
        "/api/auth/authorize",
        request
      );
      return response.data;
    } catch (error: any) {
      log.error("Security service authorization error", {
        error: error.message,
        did: request.did,
        action: request.action,
        resource: request.resource,
      });

      // Handle different error types
      if (error.response) {
        // Security service returned an error response
        return {
          authorized: false,
          reason:
            error.response.data?.reason ||
            `Authorization failed: ${error.response.status}`,
        };
      } else if (error.request) {
        // Request was made but no response received
        return {
          authorized: false,
          reason: "Security service is unavailable",
        };
      } else {
        // Error in request setup
        return {
          authorized: false,
          reason: error.message || "Authorization failed",
        };
      }
    }
  }

  /**
   * Health check - verify Security service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get("/health");
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

