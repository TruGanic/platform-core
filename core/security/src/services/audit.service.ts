// core/security/src/services/audit.service.ts
import { query, execute } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Audit Service - Logs security events for compliance and monitoring
 *
 * This service provides audit logging for:
 * - Authentication attempts
 * - Authorization decisions
 * - VC issuance and revocation
 * - Security events
 *
 * All events are logged to both:
 * 1. Application logger (console/file)
 * 2. Database (audit_logs table) for long-term storage
 */
export class AuditService {
  /**
   * Log authentication attempt
   *
   * @param did - DID of the user attempting authentication
   * @param success - Whether authentication succeeded
   * @param reason - Error reason if failed, undefined if succeeded
   * @param ip - IP address of the request (optional)
   */
  async logAuthentication(
    did: string,
    success: boolean,
    reason?: string,
    ip?: string
  ): Promise<void> {
    const event = {
      type: "authentication",
      did,
      success,
      reason,
      ip,
      timestamp: new Date().toISOString(),
    };

    // Log to application logger
    if (success) {
      log.info("Authentication successful", { did, ip });
    } else {
      log.warn("Authentication failed", { did, reason, ip });
    }

    // Store in database for long-term audit trail
    try {
      await execute(
        `
        INSERT INTO audit_logs (event_type, did, success, reason, ip_address, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          "authentication",
          did,
          success,
          reason || null,
          ip || null,
          JSON.stringify({ timestamp: event.timestamp }),
        ]
      );
    } catch (error: any) {
      // Don't throw - audit logging should not break the application
      log.error("Failed to write authentication audit log to database", {
        error: error.message,
        did,
      });
    }
  }

  /**
   * Log authorization decision
   *
   * @param did - DID of the user requesting authorization
   * @param action - Action being authorized (e.g., "POST", "GET", "DELETE")
   * @param resource - Resource being accessed (e.g., "plugins", "instances")
   * @param authorized - Whether authorization was granted
   * @param reason - Reason for denial if not authorized
   */
  async logAuthorization(
    did: string,
    action: string,
    resource: string,
    authorized: boolean,
    reason?: string
  ): Promise<void> {
    const event = {
      type: "authorization",
      did,
      action,
      resource,
      authorized,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Log to application logger
    if (authorized) {
      log.info("Authorization granted", { did, action, resource });
    } else {
      log.warn("Authorization denied", { did, action, resource, reason });
    }

    try {
      await execute(
        `
        INSERT INTO audit_logs (event_type, did, success, reason, metadata)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          "authorization",
          did,
          authorized,
          reason || null,
          JSON.stringify({
            action,
            resource,
            timestamp: event.timestamp,
          }),
        ]
      );
    } catch (error: any) {
      log.error("Failed to write authorization audit log to database", {
        error: error.message,
        did,
        action,
        resource,
      });
    }
  }

  /**
   * Log VC issuance
   *
   * @param issuerDid - DID of the issuer (core service)
   * @param subjectDid - DID of the subject receiving the VC
   * @param pluginId - Plugin ID associated with the VC
   * @param vcId - Unique VC identifier (UUID)
   */
  async logVCIssuance(
    issuerDid: string,
    subjectDid: string,
    pluginId: string,
    vcId: string
  ): Promise<void> {
    const event = {
      type: "vc_issuance",
      issuerDid,
      subjectDid,
      pluginId,
      vcId,
      timestamp: new Date().toISOString(),
    };

    log.info("VC issued", {
      issuerDid,
      subjectDid,
      pluginId,
      vcId,
    });

    try {
      await execute(
        `
        INSERT INTO audit_logs (event_type, did, success, metadata)
        VALUES ($1, $2, $3, $4)
        `,
        [
          "vc_issuance",
          subjectDid,
          true,
          JSON.stringify({
            issuerDid,
            pluginId,
            vcId,
            timestamp: event.timestamp,
          }),
        ]
      );
    } catch (error: any) {
      log.error("Failed to write VC issuance audit log to database", {
        error: error.message,
        subjectDid,
        vcId,
      });
    }
  }

  /**
   * Log VC revocation
   *
   * @param vcId - Unique VC identifier being revoked
   * @param reason - Reason for revocation
   * @param revokedBy - DID of the entity revoking the VC (optional, defaults to "system")
   */
  async logVCRevocation(
    vcId: string,
    reason: string,
    revokedBy?: string
  ): Promise<void> {
    const event = {
      type: "vc_revocation",
      vcId,
      reason,
      revokedBy: revokedBy || "system",
      timestamp: new Date().toISOString(),
    };

    log.warn("VC revoked", {
      vcId,
      reason,
      revokedBy: event.revokedBy,
    });

    try {
      await execute(
        `
        INSERT INTO audit_logs (event_type, did, success, reason, metadata)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          "vc_revocation",
          revokedBy || "system",
          true,
          reason,
          JSON.stringify({
            vcId,
            timestamp: event.timestamp,
          }),
        ]
      );
    } catch (error: any) {
      log.error("Failed to write VC revocation audit log to database", {
        error: error.message,
        vcId,
      });
    }
  }

  /**
   * Log general security event
   *
   * @param eventType - Type of security event (e.g., "suspicious_activity", "rate_limit_exceeded")
   * @param did - DID associated with the event
   * @param details - Additional event details
   */
  async logSecurityEvent(
    eventType: string,
    did: string,
    details: Record<string, any>
  ): Promise<void> {
    const event = {
      type: eventType,
      did,
      ...details,
      timestamp: new Date().toISOString(),
    };

    log.warn("Security event", {
      eventType,
      did,
      ...details,
    });

    try {
      await execute(
        `
        INSERT INTO audit_logs (event_type, did, success, metadata)
        VALUES ($1, $2, $3, $4)
        `,
        [
          eventType,
          did,
          false, // Security events are typically failures/warnings
          JSON.stringify({
            ...details,
            timestamp: event.timestamp,
          }),
        ]
      );
    } catch (error: any) {
      log.error("Failed to write security event audit log to database", {
        error: error.message,
        eventType,
        did,
      });
    }
  }

  /**
   * Query audit logs (for admin/reporting purposes)
   *
   * @param filters - Optional filters for querying logs
   * @returns Array of audit log entries
   */
  async queryLogs(filters?: {
    eventType?: string;
    did?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    try {
      let queryText = `
        SELECT id, event_type, did, success, reason, ip_address, metadata, created_at
        FROM audit_logs
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.eventType) {
        queryText += ` AND event_type = $${paramIndex}`;
        params.push(filters.eventType);
        paramIndex++;
      }

      if (filters?.did) {
        queryText += ` AND did = $${paramIndex}`;
        params.push(filters.did);
        paramIndex++;
      }

      if (filters?.success !== undefined) {
        queryText += ` AND success = $${paramIndex}`;
        params.push(filters.success);
        paramIndex++;
      }

      if (filters?.startDate) {
        queryText += ` AND created_at >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters?.endDate) {
        queryText += ` AND created_at <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }

      queryText += ` ORDER BY created_at DESC`;

      if (filters?.limit) {
        queryText += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
      }

      const results = await query(queryText, params);
      return results;
    } catch (error: any) {
      log.error("Failed to query audit logs", {
        error: error.message,
        filters,
      });
      return [];
    }
  }
}

// Export singleton instance
export const auditService = new AuditService();
