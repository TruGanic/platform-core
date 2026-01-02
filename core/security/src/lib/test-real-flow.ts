import { agent } from "@/lib/vermo";
import {
  extractPublicKeyFromDID,
  createSignaturePayload,
  verifySignature,
  signPayload,
} from "@/lib/crypto";
import axios from "axios";

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
  console.log("\n🧪 Step 1: Resolving DID from GitHub Pages...\n");

  try {
    console.log(`   Resolving: ${DEMO_CLIENT_1_DID}`);
    const resolution = await agent.resolveDid({ didUrl: DEMO_CLIENT_1_DID });

    if (resolution.didDocument) {
      console.log("   ✅ DID Resolution: SUCCESS");
      console.log(`   DID Document ID: ${resolution.didDocument.id}`);
      console.log(
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
        console.log(`   Verification Method Type: ${vm.type}`);
        console.log(`   Verification Method ID: ${vm.id}`);
      }

      return resolution.didDocument;
    } else {
      console.log("   ❌ DID Resolution: FAILED");
      console.log("   Error:", resolution.didResolutionMetadata?.error);
      return null;
    }
  } catch (error: any) {
    console.log("   ❌ DID Resolution: ERROR");
    console.log("   Error:", error.message);
    return null;
  }
}

async function testExtractPublicKey(didDocument: any) {
  console.log("\n🧪 Step 2: Extracting Public Key from DID Document...\n");

  if (!didDocument) {
    console.log("   ⚠️  Skipping: No DID document available");
    return null;
  }

  try {
    const publicKeyInfo = extractPublicKeyFromDID(didDocument);

    if (publicKeyInfo) {
      console.log("   ✅ Extract Public Key: SUCCESS");
      console.log(`   Algorithm: ${publicKeyInfo.algorithm}`);

      // Parse and show JWK details
      try {
        const jwk = JSON.parse(publicKeyInfo.publicKey);
        console.log(`   Key Type: ${jwk.kty}`);
        console.log(`   Curve: ${jwk.crv}`);
        console.log(`   X coordinate: ${jwk.x.substring(0, 20)}...`);
        console.log(`   Y coordinate: ${jwk.y.substring(0, 20)}...`);
      } catch {
        console.log(
          `   Public Key: ${publicKeyInfo.publicKey.substring(0, 50)}...`
        );
      }

      return publicKeyInfo;
    } else {
      console.log("   ❌ Extract Public Key: FAILED");
      console.log("   Could not extract public key from DID document");
      return null;
    }
  } catch (error: any) {
    console.log("   ❌ Extract Public Key: ERROR");
    console.log("   Error:", error.message);
    return null;
  }
}

function testCreateRequestPayload() {
  console.log("\n🧪 Step 3: Creating Request Payload...\n");

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

    console.log("   ✅ Create Payload: SUCCESS");
    console.log(`   Method: ${request.method}`);
    console.log(`   Path: ${request.path}`);
    console.log(`   Timestamp: ${request.timestamp}`);
    console.log(`   Nonce: ${request.nonce}`);
    console.log(`   Payload length: ${payload.length} characters`);
    console.log(`   Payload preview: ${payload.substring(0, 150)}...`);

    return { request, payload };
  } catch (error: any) {
    console.log("   ❌ Create Payload: ERROR");
    console.log("   Error:", error.message);
    return null;
  }
}

async function testSignRequest(payload: string) {
  console.log("\n🧪 Step 4: Signing Request with Private Key...\n");

  if (!DEMO_CLIENT_1_PRIVATE_KEY) {
    console.log("   ❌ Sign Request: FAILED");
    console.log("   Error: DEMO_CLIENT_1_PRIVATE_KEY not provided");
    console.log("   Set it in .env or pass as environment variable");
    return null;
  }

  try {
    // Ensure private key is in hex format (remove 0x if present)
    let privateKey = DEMO_CLIENT_1_PRIVATE_KEY;
    if (privateKey.startsWith("0x")) {
      privateKey = privateKey.substring(2);
    }

    console.log(
      `   Private Key (first 20 chars): ${privateKey.substring(0, 20)}...`
    );
    console.log(`   Private Key length: ${privateKey.length} characters`);

    const signature = await signPayload(payload, privateKey, "ES256K");

    console.log("   ✅ Sign Request: SUCCESS");
    console.log(`   Signature (base64): ${signature.substring(0, 50)}...`);
    console.log(`   Signature length: ${signature.length} characters`);

    return signature;
  } catch (error: any) {
    console.log("   ❌ Sign Request: ERROR");
    console.log("   Error:", error.message);
    console.log("   Stack:", error.stack);
    return null;
  }
}

async function testVerifySignature(
  signature: string,
  payload: string,
  didDocument: any
) {
  console.log("\n🧪 Step 5: Verifying Signature with DID Document...\n");

  if (!signature || !payload || !didDocument) {
    console.log("   ⚠️  Skipping: Missing required data");
    return false;
  }

  try {
    console.log(`   Verifying signature for DID: ${DEMO_CLIENT_1_DID}`);

    const isValid = await verifySignature(
      signature,
      payload,
      didDocument,
      DEMO_CLIENT_1_DID
    );

    if (isValid) {
      console.log("   ✅ Verify Signature: SUCCESS");
      console.log("   Signature is valid! Authentication would pass.");
    } else {
      console.log("   ❌ Verify Signature: FAILED");
      console.log(
        "   Signature verification failed. Authentication would be rejected."
      );
    }

    return isValid;
  } catch (error: any) {
    console.log("   ❌ Verify Signature: ERROR");
    console.log("   Error:", error.message);
    console.log("   Stack:", error.stack);
    return false;
  }
}

async function testFullRequestFlow() {
  console.log(
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
    
    console.log('   ✅ Full Request Flow: SUCCESS');
    console.log('   Response:', response.data);
  } catch (error: any) {
    console.log('   ⚠️  Full Request Flow: SKIPPED (Service not running or not implemented yet)');
    console.log('   Error:', error.message);
  }
  */

  console.log(
    "   ⚠️  Skipped: Security Service authentication endpoint not ready yet"
  );
}

// Main test runner
async function runRealWorldTest() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("   Real-World Test: demo-client-1 Authentication Flow");
  console.log("═══════════════════════════════════════════════════════");

  // Check if private key is provided
  if (!DEMO_CLIENT_1_PRIVATE_KEY) {
    console.log("\n❌ ERROR: DEMO_CLIENT_1_PRIVATE_KEY not provided!");
    console.log("\nTo run this test:");
    console.log("1. Add to your .env file:");
    console.log("   DEMO_CLIENT_1_PRIVATE_KEY=your_private_key_here");
    console.log("\n2. Or set as environment variable:");
    console.log("   export DEMO_CLIENT_1_PRIVATE_KEY=your_private_key_here");
    console.log(
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
    console.log("\n❌ Failed to create payload. Stopping tests.");
    return;
  }
  const { request, payload } = payloadData;

  // Step 4: Sign Request
  const signature = await testSignRequest(payload);
  if (!signature) {
    console.log("\n❌ Failed to sign request. Stopping tests.");
    return;
  }

  // Step 5: Verify Signature
  const isValid = await testVerifySignature(signature, payload, didDocument);

  // Step 6: Full Request Flow (optional)
  await testFullRequestFlow();

  // Summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("   Test Summary");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`✅ DID Resolution: ${didDocument ? "PASS" : "FAIL"}`);
  console.log(`✅ Extract Public Key: ${publicKeyInfo ? "PASS" : "FAIL"}`);
  console.log(`✅ Create Payload: ${payload ? "PASS" : "FAIL"}`);
  console.log(`✅ Sign Request: ${signature ? "PASS" : "FAIL"}`);
  console.log(`✅ Verify Signature: ${isValid ? "PASS" : "FAIL"}`);

  const allPassed =
    didDocument && publicKeyInfo && payload && signature && isValid;

  if (allPassed) {
    console.log(
      "\n🎉 All tests passed! Your authentication flow is working correctly!"
    );
    console.log("\n📋 Request Details for Demo:");
    console.log(`   DID: ${DEMO_CLIENT_1_DID}`);
    console.log(`   Method: ${request.method}`);
    console.log(`   Path: ${request.path}`);
    console.log(`   Timestamp: ${request.timestamp}`);
    console.log(`   Nonce: ${request.nonce}`);
    console.log(`   Signature: ${signature}`);
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
  }

  console.log("═══════════════════════════════════════════════════════\n");
}

// Run tests
runRealWorldTest().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});

//npx ts-node -r tsconfig-paths/register src/lib/test-real-flow.ts
