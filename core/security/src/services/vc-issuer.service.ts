// src/services/vc-issuer.service.ts
import {
  VerifiableCredential,
  IssueVCRequest,
  IssueVCResponse,
  CredentialSubject,
} from "@shared/types";
import { createJWT, ES256KSigner } from "did-jwt";
import { v4 as uuidv4 } from "uuid";
import { keyManagementService } from "./key-management.service";
import { query, execute } from "@/lib/db";
import { config } from "@/config";
import { log } from "@/lib/logger";

export class VCIssuerService {
  private coreDID: string;

  constructor() {
    this.coreDID = config.coreDID;
  }

  /**
   * Issue a Verifiable Credential to a plugin/client
   */
  async issueVC(request: IssueVCRequest): Promise<IssueVCResponse> {
    try {
      const { pluginId, did, permissions, version, expirationDate } = request;

      // Validate required fields
      if (!pluginId || !did || !permissions || permissions.length === 0) {
        return {
          success: false,
          vc: {} as VerifiableCredential,
          message:
            "Missing required fields: pluginId, did, and permissions are required",
        };
      }

      // Create credential subject
      const credentialSubject: CredentialSubject = {
        id: did,
        pluginId,
        permissions,
        version: version || "1.0.0",
      };

      // Create VC structure
      const vc: VerifiableCredential = {
        "@context": [
          "https://www.w3.org/2018/credentials/v1",
          "https://www.w3.org/2018/credentials/examples/v1",
        ],
        type: ["VerifiableCredential", "PluginPermissionCredential"],
        issuer: this.coreDID,
        credentialSubject,
        issuanceDate: new Date().toISOString(),
        expirationDate: expirationDate || this.getDefaultExpirationDate(),
      };

      // Sign the VC and create JWT
      const jws = await this.createJWT(vc);

      // Add proof to VC
      vc.proof = {
        type: "JsonWebSignature2020",
        created: new Date().toISOString(),
        proofPurpose: "assertionMethod",
        verificationMethod: `${this.coreDID}#key-1`,
        jws,
      };

      // Store VC in database
      const vcId = uuidv4();
      await this.storeVC(vcId, did, pluginId, vc, jws);

      return {
        success: true,
        vc,
        message: "VC issued successfully",
      };
    } catch (error: any) {
      log.error("VC issuance error", error);
      return {
        success: false,
        vc: {} as VerifiableCredential,
        message: error.message || "Failed to issue VC",
      };
    }
  }

  /**
   * Create JWT from VC
   */
  private async createJWT(vc: VerifiableCredential): Promise<string> {
    // Get private key
    const privateKey = await keyManagementService.getPrivateKey();
    const privateKeyBuffer = Buffer.from(privateKey, "hex");
    const signer = ES256KSigner(privateKeyBuffer);

    // Create JWT payload
    const jwtPayload = {
      iss: this.coreDID,
      sub: vc.credentialSubject.id,
      vc: {
        "@context": vc["@context"],
        type: vc.type,
        credentialSubject: vc.credentialSubject,
        issuanceDate: vc.issuanceDate,
        expirationDate: vc.expirationDate,
      },
      iat: Math.floor(new Date(vc.issuanceDate).getTime() / 1000),
      exp: vc.expirationDate
        ? Math.floor(new Date(vc.expirationDate).getTime() / 1000)
        : undefined,
    };

    return createJWT(jwtPayload, {
      issuer: this.coreDID,
      signer,
      alg: "ES256K",
    });
  }

  /**
   * Store VC in database
   */
  private async storeVC(
    vcId: string,
    did: string,
    pluginId: string,
    vc: VerifiableCredential,
    jws: string
  ): Promise<void> {
    const queryText = `
      INSERT INTO verifiable_credentials (
        vc_id, did, plugin_id, vc_data, jws, issuer_did,
        issuance_date, expiration_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (vc_id) DO UPDATE SET
        vc_data = EXCLUDED.vc_data,
        jws = EXCLUDED.jws,
        updated_at = CURRENT_TIMESTAMP
    `;

    await execute(queryText, [
      vcId,
      did,
      pluginId,
      JSON.stringify(vc),
      jws,
      this.coreDID,
      vc.issuanceDate,
      vc.expirationDate || null,
    ]);
  }

  /**
   * Get default expiration date (1 year from now)
   */
  private getDefaultExpirationDate(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString();
  }
}

// Export singleton instance
export const vcIssuerService = new VCIssuerService();
