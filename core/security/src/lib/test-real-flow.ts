import { agent } from "@/lib/vermo";
import {
  extractPublicKeyFromDID,
  createSignaturePayload,
  verifySignature,
  signPayload,
} from "@/lib/crypto";
import axios from "axios";
import { log } from "@/lib/logger";

/**
 * Real-world test using demo-client-1 DID and private key
 *
 * Usage:
 * 1. Set DEMO_CLIENT_1_PRIVATE_KEY in .env or pass as argument
 * 2. Run: npx ts-node -r tsconfig-paths/register src/lib/test-real-flow.ts
 *
 * This tests the complete authentication flow:
 * - Resolve DID from GitHub Pages
 * - Create request payload
 * - Sign with real private key
 * - Verify signature with DID document
 */

// Configuration - UPDATE THESE!
const DEMO_CLIENT_1_DID =
  "did:web:truganic.github.io:did-documents:clients:demo-client-1";
const DEMO_CLIENT_1_PRIVATE_KEY =
  process.env.DEMO_CLIENT_1_PRIVATE_KEY ||
  "9b0f4b1fac0e55a6e1d554de7ac30b4b012f995d58650c09a119603ab52f76c2";

// Test endpoint (your Security Service)
const SECURITY_SERVICE_URL =
  process.env.SECURITY_SERVICE_URL || "http://localhost:3001";

async function testResolveDID() {
  log.info("\n🧪 Step 1: Resolving DID from GitHub Pages...\n");

  try {
    log.info(`   Resolving: ${DEMO_CLIENT_1_DID}`);
    const resolution = await agent.resolveDid({ didUrl: DEMO_CLIENT_1_DID });

    if (resolution.didDocument) {
      log.info("   ✅ DID Resolution: SUCCESS");
      log.info(`   DID Document ID: ${resolution.didDocument.id}`);
      log.info(
        `   Verification Methods: ${
          resolution.didDocument.verificationMethod?.length || 0
        }`
      );

      // Show verification method details
      if (
        resolution.didDocument.verificationMethod &&
        resolution.didDocument.verificationMethod.length > 0
      ) {
        const vm = resolution.didDocument.verificationMethod[0];
        log.info(`   Verification Method Type: ${vm.type}`);
        log.info(`   Verification Method ID: ${vm.id}`);
      }

      return resolution.didDocument;
    } else {
      log.info("   ❌ DID Resolution: FAILED");
      log.info("   Error:", resolution.didResolutionMetadata?.error);
      return null;
    }
  } catch (error: any) {
    log.info("   ❌ DID Resolution: ERROR");
    log.info("   Error:", error.message);
    return null;
  }
}

async function testExtractPublicKey(didDocument: any) {
  log.info("\n🧪 Step 2: Extracting Public Key from DID Document...\n");

  if (!didDocument) {
    log.info("   ⚠️  Skipping: No DID document available");
    return null;
  }

  try {
    const publicKeyInfo = extractPublicKeyFromDID(didDocument);

    if (publicKeyInfo) {
      log.info("   ✅ Extract Public Key: SUCCESS");
      log.info(`   Algorithm: ${publicKeyInfo.algorithm}`);

      // Parse and show JWK details
      try {
        const jwk = JSON.parse(publicKeyInfo.publicKey);
        log.info(`   Key Type: ${jwk.kty}`);
        log.info(`   Curve: ${jwk.crv}`);
        log.info(`   X coordinate: ${jwk.x.substring(0, 20)}...`);
        log.info(`   Y coordinate: ${jwk.y.substring(0, 20)}...`);
      } catch {
        log.info(
          `   Public Key: ${publicKeyInfo.publicKey.substring(0, 50)}...`
        );
      }

      return publicKeyInfo;
    } else {
      log.info("   ❌ Extract Public Key: FAILED");
      log.info("   Could not extract public key from DID document");
      return null;
    }
  } catch (error: any) {
    log.info("   ❌ Extract Public Key: ERROR");
    log.info("   Error:", error.message);
    return null;
  }
}

function testCreateRequestPayload() {
  log.info("\n🧪 Step 3: Creating Request Payload...\n");

  try {
    // Create a realistic API request
    const request = {
      method: "POST",
      path: "/api/data",
      body: {
        action: "create",
        data: {
          name: "Test Item",
          value: 123,
        },
      },
      headers: {
        "content-type": "application/json",
        "user-agent": "demo-client-1/1.0.0",
      },
      timestamp: new Date().toISOString(),
      nonce: `nonce-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    const payload = createSignaturePayload({
      method: request.method,
      path: request.path,
      body: request.body,
      headers: request.headers,
      timestamp: request.timestamp,
      nonce: request.nonce,
    });

    log.info("   ✅ Create Payload: SUCCESS");
    log.info(`   Method: ${request.method}`);
    log.info(`   Path: ${request.path}`);
    log.info(`   Timestamp: ${request.timestamp}`);
    log.info(`   Nonce: ${request.nonce}`);
    log.info(`   Payload length: ${payload.length} characters`);
    log.info(`   Payload preview: ${payload.substring(0, 150)}...`);

    return { request, payload };
  } catch (error: any) {
    log.info("   ❌ Create Payload: ERROR");
    log.info("   Error:", error.message);
    return null;
  }
}

async function testSignRequest(payload: string) {
  log.info("\n🧪 Step 4: Signing Request with Private Key...\n");

  if (!DEMO_CLIENT_1_PRIVATE_KEY) {
    log.info("   ❌ Sign Request: FAILED");
    log.info("   Error: DEMO_CLIENT_1_PRIVATE_KEY not provided");
    log.info("   Set it in .env or pass as environment variable");
    return null;
  }

  try {
    // Ensure private key is in hex format (remove 0x if present)
    let privateKey = DEMO_CLIENT_1_PRIVATE_KEY;
    if (privateKey.startsWith("0x")) {
      privateKey = privateKey.substring(2);
    }

    log.info(
      `   Private Key (first 20 chars): ${privateKey.substring(0, 20)}...`
    );
    log.info(`   Private Key length: ${privateKey.length} characters`);

    const signature = await signPayload(payload, privateKey, "ES256K");

    log.info("   ✅ Sign Request: SUCCESS");
    log.info(`   Signature (base64): ${signature.substring(0, 50)}...`);
    log.info(`   Signature length: ${signature.length} characters`);

    return signature;
  } catch (error: any) {
    log.info("   ❌ Sign Request: ERROR");
    log.info("   Error:", error.message);
    log.info("   Stack:", error.stack);
    return null;
  }
}

async function testVerifySignature(
  signature: string,
  payload: string,
  didDocument: any
) {
  log.info("\n🧪 Step 5: Verifying Signature with DID Document...\n");

  if (!signature || !payload || !didDocument) {
    log.info("   ⚠️  Skipping: Missing required data");
    return false;
  }

  try {
    log.info(`   Verifying signature for DID: ${DEMO_CLIENT_1_DID}`);

    const isValid = await verifySignature(
      signature,
      payload,
      didDocument,
      DEMO_CLIENT_1_DID
    );

    if (isValid) {
      log.info("   ✅ Verify Signature: SUCCESS");
      log.info("   Signature is valid! Authentication would pass.");
    } else {
      log.info("   ❌ Verify Signature: FAILED");
      log.info(
        "   Signature verification failed. Authentication would be rejected."
      );
    }

    return isValid;
  } catch (error: any) {
    log.info("   ❌ Verify Signature: ERROR");
    log.info("   Error:", error.message);
    log.info("   Stack:", error.stack);
    return false;
  }
}

async function testFullRequestFlow() {
  log.info(
    "\n🧪 Step 6: Testing Full Request Flow (Optional - if Security Service is running)...\n"
  );

  // This would be the actual HTTP request to your Security Service
  // Uncomment when your Security Service is ready

  /*
  try {
    const request = {
      method: 'POST',
      path: '/api/data',
      body: { name: 'Test' },
      headers: {},
      timestamp: new Date().toISOString(),
      nonce: `nonce-${Date.now()}`
    };
    
    const payload = createSignaturePayload({
      method: request.method,
      path: request.path,
      body: request.body,
      headers: request.headers,
      timestamp: request.timestamp,
      nonce: request.nonce
    });
    
    const signature = await signPayload(payload, DEMO_CLIENT_1_PRIVATE_KEY.replace('0x', ''), 'ES256K');
    
    const response = await axios.post(
      `${SECURITY_SERVICE_URL}/api/auth/authenticate`,
      {
        did: DEMO_CLIENT_1_DID,
        signature: signature,
        request: {
          method: request.method,
          path: request.path,
          body: request.body,
          headers: request.headers,
          timestamp: request.timestamp,
          nonce: request.nonce
        }
      }
    );
    
    log.info('   ✅ Full Request Flow: SUCCESS');
    log.info('   Response:', response.data);
  } catch (error: any) {
    log.info('   ⚠️  Full Request Flow: SKIPPED (Service not running or not implemented yet)');
    log.info('   Error:', error.message);
  }
  */

  log.info(
    "   ⚠️  Skipped: Security Service authentication endpoint not ready yet"
  );
}

// Main test runner
async function runRealWorldTest() {
  log.info("═══════════════════════════════════════════════════════");
  log.info("   Real-World Test: demo-client-1 Authentication Flow");
  log.info("═══════════════════════════════════════════════════════");

  // Check if private key is provided
  if (!DEMO_CLIENT_1_PRIVATE_KEY) {
    log.info("\n❌ ERROR: DEMO_CLIENT_1_PRIVATE_KEY not provided!");
    log.info("\nTo run this test:");
    log.info("1. Add to your .env file:");
    log.info("   DEMO_CLIENT_1_PRIVATE_KEY=your_private_key_here");
    log.info("\n2. Or set as environment variable:");
    log.info("   export DEMO_CLIENT_1_PRIVATE_KEY=your_private_key_here");
    log.info(
      "\n3. Or pass directly in the code (not recommended for production)"
    );
    process.exit(1);
  }

  // Step 1: Resolve DID
  const didDocument = await testResolveDID();

  // Step 2: Extract Public Key
  const publicKeyInfo = await testExtractPublicKey(didDocument);

  // Step 3: Create Request Payload
  const payloadData = testCreateRequestPayload();
  if (!payloadData) {
    log.info("\n❌ Failed to create payload. Stopping tests.");
    return;
  }
  const { request, payload } = payloadData;

  // Step 4: Sign Request
  const signature = await testSignRequest(payload);
  if (!signature) {
    log.info("\n❌ Failed to sign request. Stopping tests.");
    return;
  }

  // Step 5: Verify Signature
  const isValid = await testVerifySignature(signature, payload, didDocument);

  // Step 6: Full Request Flow (optional)
  await testFullRequestFlow();

  // Summary
  log.info("\n═══════════════════════════════════════════════════════");
  log.info("   Test Summary");
  log.info("═══════════════════════════════════════════════════════");
  log.info(`✅ DID Resolution: ${didDocument ? "PASS" : "FAIL"}`);
  log.info(`✅ Extract Public Key: ${publicKeyInfo ? "PASS" : "FAIL"}`);
  log.info(`✅ Create Payload: ${payload ? "PASS" : "FAIL"}`);
  log.info(`✅ Sign Request: ${signature ? "PASS" : "FAIL"}`);
  log.info(`✅ Verify Signature: ${isValid ? "PASS" : "FAIL"}`);

  const allPassed =
    didDocument && publicKeyInfo && payload && signature && isValid;

  if (allPassed) {
    log.info(
      "\n🎉 All tests passed! Your authentication flow is working correctly!"
    );
    log.info("\n📋 Request Details for Demo:");
    log.info(`   DID: ${DEMO_CLIENT_1_DID}`);
    log.info(`   Method: ${request.method}`);
    log.info(`   Path: ${request.path}`);
    log.info(`   Timestamp: ${request.timestamp}`);
    log.info(`   Nonce: ${request.nonce}`);
    log.info(`   Signature: ${signature}`);
  } else {
    log.info("\n⚠️  Some tests failed. Check the errors above.");
  }

  log.info("═══════════════════════════════════════════════════════\n");
}

// Run tests
runRealWorldTest().catch((error) => {
  log.error("\n❌ Fatal error:", error);
  process.exit(1);
});

//npx ts-node -r tsconfig-paths/register src/lib/test-real-flow.ts
