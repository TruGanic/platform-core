// core/security/src/services/policy.service.ts
import { AuthorizeRequest, AuthorizeResponse } from "@shared/types";
import { auditService } from "./audit.service";
import { query } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Policy Service - Evaluates authorization policies
 *
 * This service checks if a user (DID) has permission to perform
 * an action on a resource based on their VC permissions.
 *
 * Permission Format:
 * - "read:demo-server-1" - Read access to demo-server-1
 * - "write:demo-server-2" - Write access to demo-server-2
 * - "delete:*" - Delete access to all resources
 *
 * Resource Mapping:
 * - POST /api/servers/demo-server-2 → "write:demo-server-2"
 * - GET /api/servers/demo-server-1 → "read:demo-server-1"
 * - DELETE /api/servers/demo-server-1 → "delete:demo-server-1"
 */
export class PolicyService {
  /**
   * Authorize an action on a resource
   *
   * @param request - Authorization request with DID, action, resource, and optional context
   * @returns Authorization response with decision and reason
   */
  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    try {
      const { did, action, resource, context } = request;

      log.info("Authorization request", { did, action, resource });

      // Map action and resource to required permission
      const requiredPermission = this.mapActionToPermission(action, resource);
      log.info("Mapped permission", { requiredPermission });

      // Get VC and extract permissions
      const vc = await this.getVCForDID(did);
      if (!vc) {
        log.warn("No valid VC found for authorization", { did });
        await auditService.logAuthorization(
          did,
          action,
          resource,
          false,
          "No valid VC found for DID"
        );
        return {
          authorized: false,
          reason: "No valid VC found for DID",
        };
      }

      // Extract permissions from VC
      const permissions = vc.credentialSubject?.permissions || [];

      log.info("User permissions", { did, permissions, requiredPermission });

      // Check if permission is granted
      const hasPermission = this.checkPermission(
        permissions,
        requiredPermission
      );

      // Apply context-aware policies if needed
      if (hasPermission && context) {
        const contextAllowed = this.evaluateContextPolicies(
          permissions,
          context
        );
        if (!contextAllowed) {
          log.warn("Context-based policy denied access", {
            did,
            action,
            resource,
          });
          await auditService.logAuthorization(
            did,
            action,
            resource,
            false,
            "Context-based policy denied access"
          );
          return {
            authorized: false,
            reason: "Context-based policy denied access",
          };
        }
      }

      // Log authorization decision
      await auditService.logAuthorization(
        did,
        action,
        resource,
        hasPermission,
        hasPermission
          ? undefined
          : `Missing required permission: ${requiredPermission}`
      );

      if (hasPermission) {
        log.info("Authorization granted", {
          did,
          action,
          resource,
          requiredPermission,
        });
      } else {
        log.warn("Authorization denied", {
          did,
          action,
          resource,
          requiredPermission,
          userPermissions: permissions,
        });
      }

      return {
        authorized: hasPermission,
        reason: hasPermission
          ? undefined
          : `Missing required permission: ${requiredPermission}`,
      };
    } catch (error: any) {
      log.error("Authorization error", {
        error: error.message,
        stack: error.stack,
        did: request.did,
        action: request.action,
        resource: request.resource,
      });
      return {
        authorized: false,
        reason: error.message || "Authorization failed",
      };
    }
  }

  /**
   * Map action and resource to permission string
   *
   * Examples:
   * - POST /api/servers/demo-server-2 → "write:demo-server-2"
   * - GET /api/servers/demo-server-1 → "read:demo-server-1"
   * - DELETE /api/servers/demo-server-1 → "delete:demo-server-1"
   * - POST /api/plugins/my-plugin → "write:my-plugin"
   *
   * @param action - HTTP method or action name (e.g., "POST", "GET", "DELETE")
   * @param resource - Resource path (e.g., "/api/servers/demo-server-1", "servers/demo-server-2")
   * @returns Permission string (e.g., "write:demo-server-2")
   */
  private mapActionToPermission(action: string, resource: string): string {
    // Convert action to permission format
    const actionMap: Record<string, string> = {
      get: "read",
      read: "read",
      post: "write",
      create: "write",
      write: "write",
      put: "write",
      update: "write",
      patch: "write",
      delete: "delete",
      remove: "delete",
    };

    const permissionAction =
      actionMap[action.toLowerCase()] || action.toLowerCase();

    // Clean resource: remove API prefixes and normalize
    let cleanResource = resource;

    // Remove leading slash first for consistent processing
    cleanResource = cleanResource.replace(/^\//, "");

    // Remove common API prefixes (now without leading slash)
    cleanResource = cleanResource
      .replace(/^api\//, "") // api/servers/demo-server-1 → servers/demo-server-1
      .replace(/^v\d+\//, "") // v1/servers/demo-server-1 → servers/demo-server-1
      .replace(/^servers\//, "") // servers/demo-server-1 → demo-server-1
      .replace(/^plugins\//, "") // plugins/my-plugin → my-plugin
      .replace(/^instances\//, ""); // instances/my-instance → my-instance

    // Take the first part (resource name) if there are still slashes
    cleanResource = cleanResource.split("/")[0];

    return `${permissionAction}:${cleanResource}`;
  }

  /**
   * Check if permissions include the required permission
   *
   * Supports:
   * - Exact match: "write:demo-server-2" === "write:demo-server-2" ✅
   * - Wildcard match: "write:*" matches "write:demo-server-2" ✅
   * - Pattern match: "write:demo-server-*" matches "write:demo-server-2" ✅
   *
   * @param permissions - Array of user permissions
   * @param requiredPermission - Required permission to check
   * @returns true if permission is granted, false otherwise
   */
  private checkPermission(
    permissions: string[],
    requiredPermission: string
  ): boolean {
    return permissions.some((perm) => {
      // Exact match
      if (perm === requiredPermission) {
        return true;
      }

      // Wildcard match: "write:*" matches "write:demo-server-2"
      if (perm.includes("*")) {
        const permPattern = perm.replace(/\*/g, ".*");
        const regex = new RegExp(`^${permPattern}$`);
        return regex.test(requiredPermission);
      }

      // Reverse wildcard: if required has wildcard, check if perm matches pattern
      if (requiredPermission.includes("*")) {
        const requiredPattern = requiredPermission.replace(/\*/g, ".*");
        const regex = new RegExp(`^${requiredPattern}$`);
        return regex.test(perm);
      }

      return false;
    });
  }

  /**
   * Evaluate context-aware policies
   *
   * This is a placeholder for future context-based policy evaluation:
   * - Time-based restrictions (e.g., only allow during business hours)
   * - IP-based restrictions (e.g., only allow from specific IPs)
   * - Resource-specific policies (e.g., rate limiting per resource)
   *
   * @param permissions - User permissions
   * @param context - Context information (IP, time, etc.)
   * @returns true if context allows access, false otherwise
   */
  private evaluateContextPolicies(
    permissions: string[],
    context: Record<string, any>
  ): boolean {
    // Check time-based policies
    if (context.time) {
      // Example: Check if permission has time restrictions
      // This is a placeholder - implement based on your policy requirements
      // const hour = new Date(context.time).getHours();
      // if (hour < 9 || hour > 17) {
      //   return false; // Outside business hours
      // }
    }

    // Check IP-based policies
    if (context.ip) {
      // Example: Check if permission has IP restrictions
      // This is a placeholder - implement based on your policy requirements
      // const allowedIPs = ["192.168.1.0/24"];
      // if (!isIPAllowed(context.ip, allowedIPs)) {
      //   return false;
      // }
    }

    // Check resource-specific policies
    if (context.resource) {
      // Example: Check if permission applies to specific resource
      // This is a placeholder - implement based on your policy requirements
    }

    // Default: allow if no context restrictions
    return true;
  }

  /**
   * Get VC for DID from database
   *
   * @param did - DID to get VC for
   * @returns VC object or null if not found
   */
  private async getVCForDID(did: string): Promise<any> {
    try {
      const results = await query<{ vc_data: any }>(
        `
        SELECT vc_data
        FROM verifiable_credentials
        WHERE did = $1
          AND revoked = false
          AND (expiration_date IS NULL OR expiration_date > NOW())
        ORDER BY issuance_date DESC
        LIMIT 1
        `,
        [did]
      );

      if (results.length === 0) {
        return null;
      }

      return results[0].vc_data;
    } catch (error: any) {
      log.error("Error fetching VC for authorization", {
        error: error.message,
        did,
      });
      return null;
    }
  }
}

// Export singleton instance
export const policyService = new PolicyService();
