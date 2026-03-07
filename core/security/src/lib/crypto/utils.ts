import { createHash } from "crypto";
import { DIDDocument, VerificationMethod } from "@shared/types";
import { verifyJWT } from "did-jwt";
import { Resolver } from "did-resolver";
import { getResolver as webDidResolver } from "web-did-resolver";
import { ec as EC } from "elliptic";
import { log } from "@/lib/logger";

/**
 * Supported signature algorithms
 * Add new algorithms here as you implement them
 */
export type SupportedAlgorithm =
  | "ES256K"
  | "Ed25519"
  | "ES256"
  | "ES384"
  | "ES512"
  | "RS256";

/**
 * Extract public key from DID document
 * Automatically detects algorithm from JWK curve or type
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
    // JWK format (JSON Web Key)
    let algorithm = "ES256K"; // default

    // Parse JWK to check curve and algorithm
    let jwk: any;
    if (typeof vm.publicKeyJwk === "string") {
      try {
        jwk = JSON.parse(vm.publicKeyJwk);
      } catch {
        jwk = vm.publicKeyJwk;
      }
    } else {
      jwk = vm.publicKeyJwk;
    }

    // Determine algorithm from JWK properties
    if (jwk.alg) {
      algorithm = jwk.alg;
    } else if (jwk.crv) {
      // Map curve to algorithm
      const curveToAlgorithm: Record<string, string> = {
        secp256k1: "ES256K",
        "P-256": "ES256",
        secp256r1: "ES256",
        "P-384": "ES384",
        secp384r1: "ES384",
        "P-521": "ES512",
        secp521r1: "ES512",
        Ed25519: "Ed25519",
        ed25519: "Ed25519",
      };
      algorithm = curveToAlgorithm[jwk.crv] || algorithm;
    } else if (jwk.kty) {
      // Infer from key type
      const ktyToAlgorithm: Record<string, string> = {
        EC: "ES256K",
        OKP: "Ed25519",
        RSA: "RS256",
      };
      algorithm = ktyToAlgorithm[jwk.kty] || algorithm;
    }

    return {
      publicKey: JSON.stringify(jwk),
      algorithm: algorithm,
    };
  } else if (vm.publicKeyMultibase) {
    // Multibase format - typically Ed25519
    return {
      publicKey: vm.publicKeyMultibase,
      algorithm: vm.type?.includes("Ed25519") ? "Ed25519" : "ES256K",
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
  timestamp: string;
  nonce: string;
  body?: any;
  headers?: Record<string, string>;
}): string {
  // Create canonical payload for signing
  // List of headers to exclude (client never signs these; HTTP clients may add them automatically)
  const excludedHeaders = new Set([
    "x-signature",
    "x-plugin-did",
    "accept",
    "accept-encoding",
    "host",
    "connection",
    "user-agent",
    "content-length",
    "if-none-match",
    "if-modified-since",
    "if-match",
    "if-range",
  ]);

  // Filter and normalize header keys to lowercase so payload matches what clients sign
  // (clients use lowercase in createSignableMessage; HTTP clients may send different casing)
  const otherHeaders: Record<string, string> = {};
  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      const lowerKey = key.toLowerCase();
      if (!excludedHeaders.has(lowerKey)) {
        otherHeaders[lowerKey] = value;
      }
    }
  }

  // Build headers object with keys in sorted order so JSON string is deterministic
  // (client and server must produce identical payload string for signature verification)
  const sortedHeaderKeys = Object.keys(otherHeaders).sort();
  const canonicalHeaders: Record<string, string> = {};
  for (const k of sortedHeaderKeys) {
    canonicalHeaders[k] = otherHeaders[k];
  }

  // Normalize body: undefined/null -> {} to match client behavior
  const normalizedBody =
    request.body !== undefined && request.body !== null ? request.body : {};

  // Debug: raw values going into canonical payload
  log.info("createSignaturePayload input (server, pre-payload)", {
    method: request.method,
    rawPath: request.path,
    timestamp: request.timestamp,
    nonce: request.nonce,
    rawBody: request.body,
    rawHeaders: request.headers,
    filteredHeaders: otherHeaders,
    normalizedBody,
  });

  const payload = {
    method: request.method,
    path: request.path,
    timestamp: request.timestamp,
    nonce: request.nonce,
    body: normalizedBody,
    headers: canonicalHeaders,
  };

  const payloadStr = JSON.stringify(payload);
  log.info("createSignaturePayload (server)", {
    path: request.path,
    method: request.method,
    payloadLength: payloadStr.length,
    payloadSha256Hex: createHash("sha256").update(payloadStr).digest("hex"),
  });
  return payloadStr;
}

/**
 * Verify signature using public key from DID document
 * Supports ES256K (fully implemented), other algorithms can be added easily
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
    if (signature.includes(".") && signature.split(".").length === 3) {
      try {
        const resolverConfig: any = {
          ...webDidResolver(),
        };
        const resolver = new Resolver(resolverConfig);

        const { payload: jwtPayload, issuer } = await verifyJWT(signature, {
          resolver,
        });

        if (issuer !== did) {
          log.error("JWT issuer does not match DID");
          return false;
        }

        const expectedPayload = JSON.parse(payload);
        const jwtPayloadObj = jwtPayload as any;

        const payloadMatches = Object.keys(expectedPayload).every((key) => {
          return (
            JSON.stringify(jwtPayloadObj[key]) ===
            JSON.stringify(expectedPayload[key])
          );
        });

        return payloadMatches;
      } catch (jwtError: any) {
        // Not a valid JWT, continue with raw signature verification
        log.warn(
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

    const algorithm = publicKeyInfo.algorithm;

    // Route to appropriate verification method
    // Add new algorithms here by adding new cases
    switch (algorithm) {
      case "ES256K":
        return verifyES256K(signature, payload, publicKeyInfo);

      // TODO: Implement other algorithms as needed
      // case "Ed25519":
      //   return verifyEd25519(signature, payload, publicKeyInfo);
      // case "ES256":
      // case "ES384":
      // case "ES512":
      //   return verifyECDSA(signature, payload, publicKeyInfo, algorithm);
      // case "RS256":
      //   return verifyRS256(signature, payload, publicKeyInfo);

      default:
        log.warn(
          `Unsupported algorithm: ${algorithm}. Only ES256K is currently implemented.`
        );
        return false;
    }
  } catch (error) {
    log.error("Signature verification error", error);
    return false;
  }
}

/**
 * Verify ES256K (secp256k1) signature
 * Supports both hex and base64url encoded coordinates
 */
function verifyES256K(
  signature: string,
  payload: string,
  publicKeyInfo: { publicKey: string; algorithm: string }
): boolean {
  try {
    // Parse JWK
    let publicKeyJwk: any;
    try {
      publicKeyJwk = JSON.parse(publicKeyInfo.publicKey);
    } catch {
      publicKeyJwk = publicKeyInfo.publicKey;
    }

    const secp256k1 = new EC("secp256k1");

    if (!publicKeyJwk.x || !publicKeyJwk.y) {
      log.error("ES256K verify failed: JWK missing x or y coordinates");
      return false;
    }

    // Decode coordinates (handles both hex and base64url)
    let xBuffer: Buffer;
    let yBuffer: Buffer;
    try {
      xBuffer = decodeCoordinate(publicKeyJwk.x);
      yBuffer = decodeCoordinate(publicKeyJwk.y);
    } catch (coordErr: any) {
      log.error("ES256K verify failed: could not decode JWK x/y", {
        error: coordErr?.message,
        xLength: String(publicKeyJwk.x).length,
        yLength: String(publicKeyJwk.y).length,
      });
      return false;
    }

    if (xBuffer.length !== 32 || yBuffer.length !== 32) {
      log.error("ES256K verify failed: invalid coordinate length", {
        xLen: xBuffer.length,
        yLen: yBuffer.length,
        expected: 32,
      });
      return false;
    }

    // Create uncompressed public key: 0x04 + x + y (65 bytes)
    const uncompressedPublicKey = Buffer.concat([
      Buffer.from([0x04]),
      xBuffer,
      yBuffer,
    ]);

    const publicKeyHex = uncompressedPublicKey.toString("hex");
    const keyPair = secp256k1.keyFromPublic(publicKeyHex, "hex");

    // Validate public key point
    if (!keyPair.getPublic().validate()) {
      log.error("Invalid public key point - not on secp256k1 curve");
      return false;
    }

    return verifyWithKeyPair(keyPair, signature, payload);
  } catch (error: any) {
    log.error("ES256K verification error", error);
    return false;
  }
}

/**
 * Helper: Decode coordinate from hex or base64url to Buffer
 * Supports both formats for maximum compatibility
 */
function decodeCoordinate(coord: string): Buffer {
  // Check if it's hex (64 hex chars = 32 bytes for secp256k1)
  if (/^[0-9a-fA-F]+$/.test(coord)) {
    if (coord.length === 64) {
      return Buffer.from(coord, "hex");
    } else if (coord.length === 66 && coord.startsWith("0x")) {
      return Buffer.from(coord.substring(2), "hex");
    }
    throw new Error(
      `Invalid hex coordinate length: ${coord.length} (expected 64)`
    );
  }

  // It's base64url - decode it
  let base64 = coord.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }

  const decoded = Buffer.from(base64, "base64");

  // Ensure exactly 32 bytes
  if (decoded.length === 32) {
    return decoded;
  } else if (decoded.length > 32) {
    return decoded.slice(decoded.length - 32);
  } else {
    const padded = Buffer.alloc(32);
    decoded.copy(padded, 32 - decoded.length);
    return padded;
  }
}

/**
 * Helper: Verify signature with a key pair
 */
function verifyWithKeyPair(
  keyPair: any,
  signature: string,
  payload: string
): boolean {
  try {
    // Hash the payload
    const hash = createHash("sha256").update(payload).digest();

    // Decode signature (base64 or base64url)
    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, "base64");
    } catch {
      let base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      signatureBuffer = Buffer.from(base64, "base64");
    }

    if (signatureBuffer.length !== 64) {
      log.error("ES256K verify failed: invalid signature length", {
        length: signatureBuffer.length,
        expected: 64,
        payloadSha256Hex: createHash("sha256").update(payload).digest("hex"),
      });
      return false;
    }

    // Parse r, s (32 bytes each)
    const r = signatureBuffer.slice(0, 32);
    const s = signatureBuffer.slice(32, 64);

    // Verify signature
    const valid = keyPair.verify(hash, {
      r: r.toString("hex"),
      s: s.toString("hex"),
    });
    if (!valid) {
      log.warn("ES256K verify failed: keyPair.verify returned false", {
        payloadSha256Hex: createHash("sha256").update(payload).digest("hex"),
        signatureLength: signatureBuffer.length,
      });
    }
    return valid;
  } catch (error: any) {
    log.error("ES256K verification error", {
      message: error?.message,
      payloadSha256Hex: createHash("sha256").update(payload).digest("hex"),
    });
    return false;
  }
}

/**
 * Sign payload with private key
 * Currently supports ES256K, easily extensible for other algorithms
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
  switch (algorithm) {
    case "ES256K":
      return signES256K(payload, privateKey);

    // TODO: Add other algorithms as needed
    // case "Ed25519":
    //   return signEd25519(payload, privateKey);
    // case "ES256":
    // case "ES384":
    // case "ES512":
    //   return signECDSA(payload, privateKey, algorithm);

    default:
      throw new Error(
        `Unsupported algorithm: ${algorithm}. Only ES256K is currently implemented.`
      );
  }
}

/**
 * Sign with ES256K (secp256k1)
 */
function signES256K(payload: string, privateKey: string): string {
  const secp256k1 = new EC("secp256k1");

  // Ensure private key is in hex format
  let privateKeyHex = privateKey;
  if (!/^[0-9a-fA-F]+$/.test(privateKey)) {
    privateKeyHex = Buffer.from(privateKey, "utf8").toString("hex");
  }

  const keyPair = secp256k1.keyFromPrivate(privateKeyHex, "hex");
  const hash = createHash("sha256").update(payload).digest();
  const signature = keyPair.sign(hash);

  // Convert to r,s format (32 bytes each, concatenated)
  const r = signature.r.toArray("be", 32);
  const s = signature.s.toArray("be", 32);
  const signatureBuffer = Buffer.concat([Buffer.from(r), Buffer.from(s)]);

  return signatureBuffer.toString("base64");
}
