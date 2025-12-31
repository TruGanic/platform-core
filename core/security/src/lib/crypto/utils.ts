import { createHash, createSign, createVerify } from "crypto";
import { DIDDocument, VerificationMethod } from "@shared/types";
import { verifyJWT } from "did-jwt";
import { Resolver } from "did-resolver";
import { getResolver as webDidResolver } from "web-did-resolver";
import { ec as EC } from "elliptic";

/**
 * Extract public key from DID document
 * @param didDocument - The DID document containing verification methods
 * @param verificationMethodId - Optional specific verification method ID to use
 * @returns Public key info with algorithm, or null if not found
 */
export function extractPublicKeyFromDID(
  didDocument: DIDDocument,
  verificationMethodId?: string
): { publicKey: string; algorithm: string } | null {
  if (
    !didDocument.verificationMethod ||
    didDocument.verificationMethod.length === 0
  ) {
    return null;
  }

  // Find verification method
  let vm: VerificationMethod | undefined;
  if (verificationMethodId) {
    // Use specified verification method
    vm = didDocument.verificationMethod.find(
      (v) =>
        v.id === verificationMethodId || v.id.endsWith(verificationMethodId)
    );
  } else {
    // Use first authentication method or first verification method
    if (didDocument.authentication && didDocument.authentication.length > 0) {
      const authId =
        typeof didDocument.authentication[0] === "string"
          ? didDocument.authentication[0]
          : didDocument.authentication[0].id;
      vm = didDocument.verificationMethod.find((v) => v.id === authId);
    }
    if (!vm) {
      vm = didDocument.verificationMethod[0];
    }
  }

  if (!vm) {
    return null;
  }

  // Extract public key based on format
  if (vm.publicKeyJwk) {
    // JWK format (JSON Web Key) - common for ES256K
    return {
      publicKey: JSON.stringify(vm.publicKeyJwk),
      algorithm: vm.type || "ES256K",
    };
  } else if (vm.publicKeyMultibase) {
    // Multibase format - common for Ed25519
    return {
      publicKey: vm.publicKeyMultibase,
      algorithm: vm.type || "Ed25519",
    };
  }

  return null;
}

/**
 * Create signature payload from request
 * This creates a canonical string representation of the request for signing
 * @param request - Request details (method, path, body, headers, timestamp, nonce)
 * @returns JSON string of the payload to sign
 */
export function createSignaturePayload(request: {
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
  timestamp: string;
  nonce: string;
}): string {
  // Create canonical payload for signing
  // Exclude signature-related headers to avoid circular dependency
  const {
    "x-signature": _,
    "x-plugin-did": __,
    ...otherHeaders
  } = request.headers || {};

  const payload = {
    method: request.method,
    path: request.path,
    body: request.body
      ? typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)
      : "",
    timestamp: request.timestamp,
    nonce: request.nonce,
    headers: otherHeaders,
  };

  return JSON.stringify(payload);
}

/**
 * Verify signature using public key from DID document
 * Supports both JWT signatures and raw ECDSA signatures
 * @param signature - The signature to verify (JWT or base64 encoded)
 * @param payload - The payload that was signed (JSON string)
 * @param didDocument - The DID document containing the public key
 * @param did - The DID that should match the signature issuer
 * @returns true if signature is valid, false otherwise
 */
export async function verifySignature(
  signature: string,
  payload: string,
  didDocument: DIDDocument,
  did: string
): Promise<boolean> {
  try {
    // Try to verify as JWT first (common case)
    // JWT format: header.payload.signature (3 parts separated by dots)
    if (signature.includes(".") && signature.split(".").length === 3) {
      try {
        const resolverConfig: any = {
          ...webDidResolver(),
        };
        const resolver = new Resolver(resolverConfig);

        // Verify JWT signature using did-jwt
        const { payload: jwtPayload, issuer } = await verifyJWT(signature, {
          resolver,
        });

        // Verify issuer matches the DID
        if (issuer !== did) {
          console.error("JWT issuer does not match DID");
          return false;
        }

        // Verify the payload matches the request payload
        // JWT payload may contain additional fields (iat, exp, etc.)
        const expectedPayload = JSON.parse(payload);
        const jwtPayloadObj = jwtPayload as any;

        // Check if the request payload matches the JWT payload
        // Allow for additional fields in JWT
        const payloadMatches = Object.keys(expectedPayload).every((key) => {
          return (
            JSON.stringify(jwtPayloadObj[key]) ===
            JSON.stringify(expectedPayload[key])
          );
        });

        return payloadMatches;
      } catch (jwtError: any) {
        // Not a valid JWT or verification failed, continue with raw signature verification
        console.warn(
          "JWT verification failed, trying raw signature:",
          jwtError.message
        );
      }
    }

    // Extract public key from DID document
    const publicKeyInfo = extractPublicKeyFromDID(didDocument);
    if (!publicKeyInfo) {
      return false;
    }

    // For ES256K (secp256k1) - use proper ECDSA verification
    if (
      publicKeyInfo.algorithm === "ES256K" ||
      publicKeyInfo.algorithm.includes("ES256")
    ) {
      try {
        // Parse JWK if it's a JSON string
        let publicKeyJwk: any;
        try {
          publicKeyJwk = JSON.parse(publicKeyInfo.publicKey);
        } catch {
          // Not JSON, use as-is
          publicKeyJwk = publicKeyInfo.publicKey;
        }

        // Initialize secp256k1 curve
        const secp256k1 = new EC("secp256k1");

        // Extract public key from JWK
        if (!publicKeyJwk.x || !publicKeyJwk.y) {
          console.error("Invalid JWK: missing x or y coordinates");
          return false;
        }

        // Convert JWK coordinates to Buffer
        const xBuffer = Buffer.from(publicKeyJwk.x, "base64url");
        const yBuffer = Buffer.from(publicKeyJwk.y, "base64url");

        // Create public key point (uncompressed format: 0x04 + x + y)
        const publicKeyPoint = secp256k1.curve.point(
          secp256k1.curve.decodePoint(
            Buffer.concat([Buffer.from([0x04]), xBuffer, yBuffer])
          )
        );

        // Create key pair from public point
        const keyPair = secp256k1.keyPair({ pub: publicKeyPoint });

        // Hash the payload using SHA-256
        const hash = createHash("sha256").update(payload).digest();

        // Decode signature (base64 or base64url)
        let signatureBuffer: Buffer;
        try {
          // Try base64 first
          signatureBuffer = Buffer.from(signature, "base64");
        } catch {
          // Try base64url
          signatureBuffer = Buffer.from(signature, "base64url");
        }

        // Parse signature (raw r,s format: 32 bytes each, 64 bytes total)
        let r: Buffer, s: Buffer;
        if (signatureBuffer.length === 64) {
          // Raw r,s format (32 bytes each)
          r = signatureBuffer.slice(0, 32);
          s = signatureBuffer.slice(32, 64);
        } else {
          // Invalid signature length
          if (signatureBuffer.length < 64) {
            console.error("Invalid signature length");
            return false;
          }
          // Assume first 64 bytes are r,s
          r = signatureBuffer.slice(0, 32);
          s = signatureBuffer.slice(32, 64);
        }

        // Verify signature
        const isValid = keyPair.verify(hash, {
          r: r.toString("hex"),
          s: s.toString("hex"),
        });
        return isValid;
      } catch (error) {
        console.error("ES256K verification error:", error);
        return false;
      }
    }

    // For Ed25519 (if you need it in the future)
    if (publicKeyInfo.algorithm === "Ed25519") {
      try {
        const verify = createVerify("Ed25519");
        verify.update(payload);
        return verify.verify(publicKeyInfo.publicKey, signature, "base64");
      } catch (error) {
        console.error("Ed25519 verification error:", error);
        return false;
      }
    }

    console.warn(`Unsupported algorithm: ${publicKeyInfo.algorithm}`);
    return false;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Sign payload with private key
 * Returns signature in base64 format (r,s concatenated, 64 bytes total)
 * @param payload - The payload to sign (JSON string)
 * @param privateKey - Private key in hex format (no 0x prefix)
 * @param algorithm - Signature algorithm (default: ES256K)
 * @returns Base64 encoded signature
 */
export async function signPayload(
  payload: string,
  privateKey: string,
  algorithm: string = "ES256K"
): Promise<string> {
  try {
    if (algorithm === "ES256K" || algorithm.includes("ES256")) {
      // Use elliptic library for proper secp256k1 signing
      const secp256k1 = new EC("secp256k1");

      // Ensure private key is in hex format
      let privateKeyHex = privateKey;
      if (!/^[0-9a-fA-F]+$/.test(privateKey)) {
        // If not hex, try to convert from other formats
        privateKeyHex = Buffer.from(privateKey, "utf8").toString("hex");
      }

      // Create key pair from private key
      const keyPair = secp256k1.keyFromPrivate(privateKeyHex, "hex");

      // Hash the payload using SHA-256
      const hash = createHash("sha256").update(payload).digest();

      // Sign the hash
      const signature = keyPair.sign(hash);

      // Convert signature to r,s format (32 bytes each, concatenated)
      const r = signature.r.toArray("be", 32);
      const s = signature.s.toArray("be", 32);
      const signatureBuffer = Buffer.concat([Buffer.from(r), Buffer.from(s)]);

      return signatureBuffer.toString("base64");
    }

    if (algorithm === "Ed25519") {
      const sign = createSign("Ed25519");
      sign.update(payload);
      const privateKeyBuffer = Buffer.from(privateKey, "hex");
      return sign.sign(privateKeyBuffer, "base64");
    }

    throw new Error(`Unsupported algorithm: ${algorithm}`);
  } catch (error) {
    console.error("Signing error:", error);
    throw error;
  }
}
