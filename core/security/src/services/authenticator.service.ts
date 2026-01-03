// core/security/src/services/authenticator.service.ts
import {
  AuthenticateRequest,
  AuthenticateResponse,
  VerifiableCredential,
} from "@shared/types";
import { DIDResolverService } from "./did-resolver.service";
import { VCVerifierService } from "./vc-verifier.service";
import {
  extractPublicKeyFromDID,
  createSignaturePayload,
  verifySignature,
} from "@/lib/crypto/utils";
import { auditService } from "./audit.service";
import { query } from "@/lib/db";
import { initRedis } from "@/lib/cache";
import { log } from "@/lib/logger";
import { config } from "@/config";

/**
 * Authenticator Service
 *
 * Handles authentication of requests using:
 * 1. DID resolution to get public keys
 * 2. Cryptographic signature verification
 * 3. Nonce validation (replay attack prevention)
 * 4. Timestamp validation (old request prevention)
 * 5. VC verification to get permissions
 *
 * Flow:
 * 1. Resolve DID → Get public key
 * 2. Verify nonce (not reused)
 * 3. Verify timestamp (not too old)
 * 4. Verify signature (cryptographically valid)
 * 5. Get and verify VC → Extract permissions
 */
export class AuthenticatorService {
  private didResolver: DIDResolverService;
  private vcVerifier: VCVerifierService;
  private redis: ReturnType<typeof initRedis>;
  private nonceTTL: number = 300; // 5 minutes
  private maxRequestAge: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.didResolver = new DIDResolverService();
    this.vcVerifier = new VCVerifierService();
    this.redis = initRedis();
  }

  /**
   * Authenticate a request
   * @param request - Authentication request with DID, signature, and request details
   * @returns Authentication response with validity and permissions
   */
  async authenticateRequest(
    request: AuthenticateRequest
  ): Promise<AuthenticateResponse> {
    const { did, signature, request: req } = request;
    let ip: string = "unknown";

    try {
      // Extract IP address for logging
      ip =
        req.headers?.["x-forwarded-for"] ||
        req.headers?.["x-real-ip"] ||
        req.headers?.["x-client-ip"] ||
        "unknown";

      // 1. Resolve DID to get public key
      log.info("Resolving DID", { did });
      const didResolution = await this.didResolver.resolveDID({ did });
      if (!didResolution.resolved) {
        log.warn("DID resolution failed", { did });
        await auditService.logAuthentication(
          did,
          false,
          "Failed to resolve DID",
          ip
        );
        return {
          valid: false,
          error: "Failed to resolve DID",
        };
      }

      // 2. Verify nonce (prevent replay attacks)
      log.info("Verifying nonce", { did, nonce: req.nonce });
      const nonceValid = await this.verifyNonce(did, req.nonce);
      if (!nonceValid) {
        log.warn("Invalid or reused nonce", { did, nonce: req.nonce });
        await auditService.logAuthentication(
          did,
          false,
          "Invalid or reused nonce",
          ip
        );
        return {
          valid: false,
          error: "Invalid or reused nonce",
        };
      }

      // 3. Verify timestamp (prevent old requests)
      log.info("Verifying timestamp", { did, timestamp: req.timestamp });
      const timestamp = new Date(req.timestamp);
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - timestamp.getTime());

      if (isNaN(timestamp.getTime())) {
        log.warn("Invalid timestamp format", { did, timestamp: req.timestamp });
        await auditService.logAuthentication(
          did,
          false,
          "Invalid timestamp format",
          ip
        );
        return {
          valid: false,
          error: "Invalid timestamp format",
        };
      }

      if (timeDiff > this.maxRequestAge) {
        log.warn("Request timestamp too old", {
          did,
          timestamp: req.timestamp,
          age: timeDiff,
        });
        await auditService.logAuthentication(
          did,
          false,
          "Request timestamp too old",
          ip
        );
        return {
          valid: false,
          error: "Request timestamp too old",
        };
      }

      // 4. Verify signature cryptographically
      log.info("Verifying signature", { did });
      const publicKeyInfo = extractPublicKeyFromDID(didResolution.document);
      if (!publicKeyInfo) {
        log.warn("No public key found in DID document", { did });
        await auditService.logAuthentication(
          did,
          false,
          "No public key found in DID document",
          ip
        );
        return {
          valid: false,
          error: "No public key found in DID document",
        };
      }

      const signaturePayload = createSignaturePayload(req);
      const signatureValid = await verifySignature(
        signature,
        signaturePayload,
        didResolution.document,
        did
      );

      if (!signatureValid) {
        log.warn("Invalid signature", { did });
        await auditService.logAuthentication(
          did,
          false,
          "Invalid signature",
          ip
        );
        return {
          valid: false,
          error: "Invalid signature",
        };
      }

      // 5. Get VC and verify it
      log.info("Getting VC for DID", { did });
      const vc = await this.getVCForDID(did);
      if (!vc) {
        log.warn("No valid VC found for DID", { did });
        await auditService.logAuthentication(
          did,
          false,
          "No valid VC found for DID",
          ip
        );
        return {
          valid: false,
          error: "No valid VC found for DID",
        };
      }

      // Verify VC
      log.info("Verifying VC", { did });
      const vcVerification = await this.vcVerifier.verifyVC({ vc });
      if (!vcVerification.valid) {
        log.warn("VC verification failed", {
          did,
          error: vcVerification.error,
        });
        await auditService.logAuthentication(
          did,
          false,
          vcVerification.error || "VC verification failed",
          ip
        );
        return {
          valid: false,
          error: vcVerification.error || "VC verification failed",
        };
      }

      // Mark nonce as used (prevent reuse)
      await this.markNonceUsed(did, req.nonce);

      // Log successful authentication
      log.info("Authentication successful", {
        did,
        permissions: vcVerification.permissions?.length || 0,
      });
      await auditService.logAuthentication(did, true, undefined, ip);

      return {
        valid: true,
        permissions: vcVerification.permissions || [],
      };
    } catch (error: any) {
      log.error("Authentication error", {
        error: error.message,
        stack: error.stack,
        did,
      });

      // Log failed authentication
      await auditService.logAuthentication(
        did || "unknown",
        false,
        error.message || "Authentication failed",
        ip
      );

      return {
        valid: false,
        error: error.message || "Authentication failed",
      };
    }
  }

  /**
   * Get VC for DID from database
   * Returns the most recent active (not revoked, not expired) VC
   *
   * @param did - DID to get VC for
   * @returns VC as object or JWT string, or null if not found
   */
  private async getVCForDID(
    did: string
  ): Promise<VerifiableCredential | string | null> {
    try {
      const results = await query<{
        vc_data: VerifiableCredential;
        jws: string | null;
      }>(
        `
        SELECT vc_data, jws
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

      const row = results[0];
      // Prefer JWS format if available (more compact), otherwise use vc_data
      if (row.jws) {
        return row.jws; // JWT string
      }

      return row.vc_data as VerifiableCredential;
    } catch (error: any) {
      log.error("Error fetching VC from database", {
        error: error.message,
        did,
      });
      return null;
    }
  }

  /**
   * Verify nonce has not been used before
   * - If nonce doesn't exist in Redis → Valid (first time use)
   * - If nonce exists in Redis → Invalid (already used)
   */
  private async verifyNonce(did: string, nonce: string): Promise<boolean> {
    try {
      const key = `nonce:${did}:${nonce}`;
      const exists = await this.redis.exists(key);
      // Nonce should NOT exist (not used before)
      return exists === 0;
    } catch (error: any) {
      log.error("Nonce verification error", {
        error: error.message,
        did,
        nonce,
      });
      // On error, reject to be safe
      return false;
    }
  }

  /**
   * Mark nonce as used (store in Redis with TTL)
   * This prevents the same nonce from being reused
   */
  private async markNonceUsed(did: string, nonce: string): Promise<void> {
    try {
      const key = `nonce:${did}:${nonce}`;
      // Store with TTL (5 minutes) to mark as used
      await this.redis.setex(key, this.nonceTTL, "1");
    } catch (error: any) {
      log.error("Nonce marking error", {
        error: error.message,
        did,
        nonce,
      });
      // Don't throw - nonce marking failure shouldn't break authentication
    }
  }

  /**
   * Generate a nonce (helper for testing only)
   * In production, clients generate their own nonces
   * This just returns a UUID - doesn't store anything
   */
  async generateNonce(did: string): Promise<string> {
    const { randomUUID } = await import("crypto");
    return randomUUID();
  }

  /**
   * Cleanup method (for testing or maintenance)
   * Closes Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      // Ignore errors on close
    }
  }
}

// Export singleton instance
export const authenticatorService = new AuthenticatorService();
