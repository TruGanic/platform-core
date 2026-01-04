// core/security/src/services/vc-verifier.service.ts
import {
  VerifiableCredential,
  VerifyVCRequest,
  VerifyVCResponse,
} from "@shared/types";
import { DIDResolverService } from "./did-resolver.service";
import { verifyJWT } from "did-jwt";
import { Resolver } from "did-resolver";
import { getResolver as webDidResolver } from "web-did-resolver";
import { query } from "@/lib/db";
import { config } from "@/config";

export class VCVerifierService {
  private didResolver: DIDResolverService;
  private coreDID: string;
  private resolver: Resolver;

  constructor() {
    this.didResolver = new DIDResolverService();
    this.coreDID = config.coreDID;

    // Initialize DID resolver for JWT verification
    const resolverConfig: any = {
      ...webDidResolver(),
    };
    this.resolver = new Resolver(resolverConfig);
  }

  /**
   * Verify a Verifiable Credential
   */
  async verifyVC(request: VerifyVCRequest): Promise<VerifyVCResponse> {
    try {
      let vc: VerifiableCredential;
      let jws: string | undefined;

      // Handle both object and JWT string formats
      if (typeof request.vc === "string") {
        jws = request.vc;
        // Verify JWT first
        const verified = await this.verifyJWT(jws);
        if (!verified.valid) {
          return {
            valid: false,
            error: verified.error || "JWT verification failed",
          };
        }
        vc = verified.vc!;
      } else {
        vc = request.vc;
        jws = vc.proof?.jws;
      }

      /// Verify issuer
      if (!vc.issuer) {
        return {
          valid: false,
          error: "VC missing issuer information",
        };
      }
      const issuer = typeof vc.issuer === "string" ? vc.issuer : vc.issuer.id;
      if (issuer !== this.coreDID) {
        return {
          valid: false,
          error: `Invalid issuer. Expected ${this.coreDID}, got ${issuer}`,
        };
      }

      // Check expiration
      if (vc.expirationDate) {
        const expiration = new Date(vc.expirationDate);
        if (expiration < new Date()) {
          return {
            valid: false,
            error: "VC has expired",
          };
        }
      }

      // Verify proof cryptographically
      if (!vc.proof || !vc.proof.jws) {
        return {
          valid: false,
          error: "Missing proof or JWS",
        };
      }

      // Verify JWS signature
      const proofValid = await this.verifyProof(vc.proof.jws);
      if (!proofValid) {
        return {
          valid: false,
          error: "Invalid proof signature",
        };
      }

      // Check revocation status (check both database tables)
      const isRevoked = await this.isVCRevoked(vc, jws);
      if (isRevoked) {
        return {
          valid: false,
          error: "VC has been revoked",
        };
      }

      // Extract permissions
      const permissions = vc.credentialSubject?.permissions || [];

      return {
        valid: true,
        vc,
        permissions,
      };
    } catch (error: any) {
      console.error("VC verification error:", error);
      return {
        valid: false,
        error: error.message || "Failed to verify VC",
      };
    }
  }

  /**
   * Verify JWT format VC
   */
  private async verifyJWT(
    jwt: string
  ): Promise<{ valid: boolean; vc?: VerifiableCredential; error?: string }> {
    try {
      const { payload, issuer } = await verifyJWT(jwt, {
        resolver: this.resolver,
      });

      // Extract VC from JWT payload
      const vc = (payload as any).vc as VerifiableCredential;
      if (!vc) {
        return {
          valid: false,
          error: "Invalid VC in JWT payload",
        };
      }

      vc.issuer = issuer;

      // Add proof with JWS
      vc.proof = {
        type: "JsonWebSignature2020",
        created: new Date((payload.iat || 0) * 1000).toISOString(),
        proofPurpose: "assertionMethod",
        verificationMethod: `${issuer}#key-1`,
        jws: jwt,
      };

      return {
        valid: true,
        vc,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || "JWT verification failed",
      };
    }
  }

  /**
   * Verify proof signature
   */
  private async verifyProof(jws: string): Promise<boolean> {
    try {
      // Resolve issuer DID to get public key
      const issuerResolution = await this.didResolver.resolveDID({
        did: this.coreDID,
      });
      if (!issuerResolution.resolved) {
        console.error("Failed to resolve issuer DID:", this.coreDID);
        return false;
      }

      // Verify JWT using did-jwt
      const { payload } = await verifyJWT(jws, {
        resolver: this.resolver,
      });

      return !!payload;
    } catch (error: any) {
      console.error("Proof verification error:", error.message);
      return false;
    }
  }

  /**
   * Check if VC is revoked
   * Checks both the revoked flag in verifiable_credentials table
   * and the vc_revocation_list table
   */
  private async isVCRevoked(
    vc: VerifiableCredential,
    jws?: string
  ): Promise<boolean> {
    try {
      // First, try to find the VC in the database by JWS
      // This gives us the actual vc_id (UUID) stored by the issuer
      let vcId: string | null = null;

      if (jws) {
        // Look up VC by JWS to get the actual vc_id
        const lookupQuery = `
          SELECT vc_id, revoked
          FROM verifiable_credentials
          WHERE jws = $1
          LIMIT 1
        `;
        const lookupResult = await query<{ vc_id: string; revoked: boolean }>(
          lookupQuery,
          [jws]
        );

        if (lookupResult.length > 0) {
          const row = lookupResult[0];
          // Check revoked flag in main table
          if (row.revoked === true) {
            return true;
          }
          vcId = row.vc_id;
        }
      }

      // If we couldn't find by JWS, try by DID + plugin_id
      if (!vcId && vc.credentialSubject) {
        const lookupQuery = `
          SELECT vc_id, revoked
          FROM verifiable_credentials
          WHERE did = $1 AND plugin_id = $2
          ORDER BY issuance_date DESC
          LIMIT 1
        `;
        const lookupResult = await query<{ vc_id: string; revoked: boolean }>(
          lookupQuery,
          [vc.credentialSubject.id, vc.credentialSubject.pluginId]
        );

        if (lookupResult.length > 0) {
          const row = lookupResult[0];
          if (row.revoked === true) {
            return true;
          }
          vcId = row.vc_id;
        }
      }

      // If we have a vc_id, check the revocation list
      if (vcId) {
        const revocationQuery = `
          SELECT COUNT(*) as count
          FROM vc_revocation_list
          WHERE vc_id = $1
        `;
        const revocationResult = await query<{ count: string }>(
          revocationQuery,
          [vcId]
        );
        return parseInt(revocationResult[0].count) > 0;
      }

      // If we can't find the VC in the database, we can't verify revocation
      // This might be OK if the VC was issued elsewhere, but log it
      console.warn("VC not found in database for revocation check");
      return false;
    } catch (error: any) {
      console.error("Revocation check error:", error.message);
      // On error, don't fail verification - just log it
      return false;
    }
  }

  /**
   * Extract permissions from VC
   */
  extractPermissions(vc: VerifiableCredential): string[] {
    return vc.credentialSubject?.permissions || [];
  }
}

// Export singleton instance
export const vcVerifierService = new VCVerifierService();
