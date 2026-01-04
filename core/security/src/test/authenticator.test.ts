// core/security/src/test/authenticator.test.ts
import { authenticatorService } from "../services/authenticator.service";
import { vcIssuerService } from "../services/vc-issuer.service";
import { AuthenticateRequest } from "@shared/types";
import { createSignaturePayload, signPayload } from "@/lib/crypto/utils";
import { randomUUID } from "crypto";
import { closeRedis } from "@/lib/cache";

const CLIENT_DID =
  "did:web:truganic.github.io:did-documents:clients:demo-client-1";
const TEST_PLUGIN_ID = "demo-plugin-1";
const CLIENT_PRIVATE_KEY =
  process.env.CLIENT_PRIVATE_KEY ||
  "9b0f4b1fac0e55a6e1d554de7ac30b4b012f995d58650c09a119603ab52f76c2";

async function testAuthenticator() {
  console.log("\n🧪 Testing Authenticator Service...\n");

  if (!CLIENT_PRIVATE_KEY) {
    console.error("❌ CLIENT_PRIVATE_KEY not set");
    return;
  }

  try {
    // Step 1: Issue VC
    console.log("📝 Step 1: Issuing VC...");
    const issueResult = await vcIssuerService.issueVC({
      pluginId: TEST_PLUGIN_ID,
      did: CLIENT_DID,
      permissions: ["read:plugins", "write:instances"],
    });

    if (!issueResult.success) {
      console.error("❌ Failed to issue VC");
      return;
    }
    console.log("✅ VC issued\n");

    // Step 2: Client generates nonce (client-side)
    console.log("🔑 Step 2: Client generates nonce...");
    const nonce = randomUUID(); // Client generates this
    console.log("✅ Nonce:", nonce, "\n");

    // Step 3: Create and sign request
    console.log("✍️  Step 3: Creating and signing request...");
    const requestPayload = {
      method: "POST",
      path: "/api/plugins",
      body: { name: "Test Plugin" },
      headers: { "content-type": "application/json" },
      timestamp: new Date().toISOString(),
      nonce, // Client-generated nonce
    };

    const signaturePayload = createSignaturePayload(requestPayload);
    const signature = await signPayload(
      signaturePayload,
      CLIENT_PRIVATE_KEY,
      "ES256K"
    );
    console.log("✅ Request signed\n");

    // Step 4: Authenticate (nonce should NOT exist in Redis yet)
    console.log("🔍 Step 4: Authenticating request...");
    const authRequest: AuthenticateRequest = {
      did: CLIENT_DID,
      signature,
      request: requestPayload,
    };

    const authResult = await authenticatorService.authenticateRequest(
      authRequest
    );

    if (authResult.valid) {
      console.log("✅✅✅ AUTHENTICATION SUCCESSFUL! ✅✅✅");
      console.log("   Permissions:", authResult.permissions, "\n");
    } else {
      console.log("❌ Authentication failed:", authResult.error, "\n");
    }

    // Step 5: Try to reuse same nonce (should fail)
    console.log("🚫 Step 5: Testing nonce reuse (should fail)...");
    const reusedResult = await authenticatorService.authenticateRequest(
      authRequest
    );
    if (reusedResult.valid) {
      console.error("❌ Should have rejected reused nonce!");
    } else {
      console.log("✅ Correctly rejected reused nonce");
      console.log("   Error:", reusedResult.error, "\n");
    }

    // Step 6: New request with new nonce (should work)
    console.log("✅ Step 6: New request with new nonce (should succeed)...");
    const newNonce = randomUUID(); // New client-generated nonce
    const newRequestPayload = {
      ...requestPayload,
      timestamp: new Date().toISOString(),
      nonce: newNonce,
    };
    const newSignaturePayload = createSignaturePayload(newRequestPayload);
    const newSignature = await signPayload(
      newSignaturePayload,
      CLIENT_PRIVATE_KEY,
      "ES256K"
    );

    const newAuthResult = await authenticatorService.authenticateRequest({
      did: CLIENT_DID,
      signature: newSignature,
      request: newRequestPayload,
    });

    if (newAuthResult.valid) {
      console.log("✅ Authentication successful with new nonce!");
      console.log("   Permissions:", newAuthResult.permissions, "\n");
    } else {
      console.log("❌ Authentication failed:", newAuthResult.error, "\n");
    }

    console.log("=".repeat(60));
    console.log("✅ Test Complete!");
    console.log("=".repeat(60));
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    throw error;
  } finally {
    try {
      await authenticatorService.close();
    } catch (error) {
      // Ignore cleanup errors
    }
    try {
      await closeRedis();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

if (require.main === module) {
  testAuthenticator()
    .then(() => {
      console.log("\n✨ Test finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { testAuthenticator };
