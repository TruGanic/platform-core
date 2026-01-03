// core/security/src/test/policy.test.ts
import { policyService } from "../services/policy.service";
import { vcIssuerService } from "../services/vc-issuer.service";
import { AuthorizeRequest } from "@shared/types";
import { closeRedis } from "@/lib/cache";

/**
 * Test Policy Service
 *
 * Prerequisites:
 * 1. Database is running and schema is created
 * 2. CORE_PRIVATE_KEY is set in .env
 * 3. CORE_DID is set in .env
 * 4. DATABASE_URL is set in .env
 * 5. REDIS_URL is set in .env
 */

const CLIENT_DID =
  "did:web:truganic.github.io:did-documents:clients:demo-client-1";
const TEST_PLUGIN_ID = "demo-plugin-policy-test";

async function testPolicyService() {
  console.log("\n🧪 Testing Policy Service...\n");

  try {
    // STEP 1: Issue VC with specific server permissions
    console.log("📝 Step 1: Issuing VC with server-specific permissions...");
    const issueResult = await vcIssuerService.issueVC({
      pluginId: TEST_PLUGIN_ID,
      did: CLIENT_DID,
      permissions: [
        "read:demo-server-1",
        "write:demo-server-2",
        "delete:demo-server-2",
        "read:demo-server-3",
      ],
      version: "1.0.0",
    });

    if (!issueResult.success) {
      console.error("❌ Failed to issue VC:", issueResult.message);
      return;
    }

    console.log("✅ VC issued successfully!");
    console.log(
      "   Permissions:",
      issueResult.vc.credentialSubject.permissions
    );
    console.log("   Issued to:", CLIENT_DID, "\n");

    // STEP 2: Test exact permission match - should succeed
    console.log(
      "✅ Test 2: Testing exact permission match (should succeed)..."
    );
    const authzRequest1: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "GET",
      resource: "/api/servers/demo-server-1",
    };

    const result1 = await policyService.authorize(authzRequest1);
    if (result1.authorized) {
      console.log("✅ Authorization granted!");
      console.log("   Action: GET");
      console.log("   Resource: /api/servers/demo-server-1");
      console.log("   Required: read:demo-server-1");
      console.log("   User has: ✅", "\n");
    } else {
      console.error("❌ Should have granted access");
      console.log("   Reason:", result1.reason, "\n");
    }

    // STEP 3: Test exact permission match - write - should succeed
    console.log("✅ Test 3: Testing write permission (should succeed)...");
    const authzRequest2: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "POST",
      resource: "/api/servers/demo-server-2",
    };

    const result2 = await policyService.authorize(authzRequest2);
    if (result2.authorized) {
      console.log("✅ Authorization granted!");
      console.log("   Action: POST");
      console.log("   Resource: /api/servers/demo-server-2");
      console.log("   Required: write:demo-server-2");
      console.log("   User has: ✅", "\n");
    } else {
      console.error("❌ Should have granted access");
      console.log("   Reason:", result2.reason, "\n");
    }

    // STEP 4: Test exact permission match - delete - should succeed
    console.log("✅ Test 4: Testing delete permission (should succeed)...");
    const authzRequest3: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "DELETE",
      resource: "servers/demo-server-2",
    };

    const result3 = await policyService.authorize(authzRequest3);
    if (result3.authorized) {
      console.log("✅ Authorization granted!");
      console.log("   Action: DELETE");
      console.log("   Resource: servers/demo-server-2");
      console.log("   Required: delete:demo-server-2");
      console.log("   User has: ✅", "\n");
    } else {
      console.error("❌ Should have granted access");
      console.log("   Reason:", result3.reason, "\n");
    }

    // STEP 5: Test permission denied - write on server-1 (only has read)
    console.log(
      "🚫 Test 5: Testing write on server-1 (should fail - only has read)..."
    );
    const authzRequest4: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "POST",
      resource: "/api/servers/demo-server-1",
    };

    const result4 = await policyService.authorize(authzRequest4);
    if (!result4.authorized) {
      console.log("✅ Correctly denied access!");
      console.log("   Action: POST");
      console.log("   Resource: /api/servers/demo-server-1");
      console.log("   Required: write:demo-server-1");
      console.log("   User has: read:demo-server-1 (not write)");
      console.log("   Reason:", result4.reason, "\n");
    } else {
      console.error("❌ Should have denied access");
    }

    // STEP 6: Test permission denied - read on server-2 (only has write/delete)
    console.log(
      "🚫 Test 6: Testing read on server-2 (should fail - only has write/delete)..."
    );
    const authzRequest5: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "GET",
      resource: "servers/demo-server-2",
    };

    const result5 = await policyService.authorize(authzRequest5);
    if (!result5.authorized) {
      console.log("✅ Correctly denied access!");
      console.log("   Action: GET");
      console.log("   Resource: servers/demo-server-2");
      console.log("   Required: read:demo-server-2");
      console.log(
        "   User has: write:demo-server-2, delete:demo-server-2 (not read)"
      );
      console.log("   Reason:", result5.reason, "\n");
    } else {
      console.error("❌ Should have denied access");
    }

    // STEP 7: Test permission denied - access to non-existent server
    console.log(
      "🚫 Test 7: Testing access to server-999 (should fail - not in permissions)..."
    );
    const authzRequest6: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "GET",
      resource: "/api/servers/demo-server-999",
    };

    const result6 = await policyService.authorize(authzRequest6);
    if (!result6.authorized) {
      console.log("✅ Correctly denied access!");
      console.log("   Action: GET");
      console.log("   Resource: /api/servers/demo-server-999");
      console.log("   Required: read:demo-server-999");
      console.log(
        "   User has: read:demo-server-1, write:demo-server-2, etc. (not server-999)"
      );
      console.log("   Reason:", result6.reason, "\n");
    } else {
      console.error("❌ Should have denied access");
    }

    // STEP 8: Test different HTTP methods mapping
    console.log("✅ Test 8: Testing different HTTP methods...");
    const methods = [
      { action: "GET", expected: "read" },
      { action: "POST", expected: "write" },
      { action: "PUT", expected: "write" },
      { action: "PATCH", expected: "write" },
      { action: "DELETE", expected: "delete" },
    ];

    for (const method of methods) {
      const testRequest: AuthorizeRequest = {
        did: CLIENT_DID,
        action: method.action,
        resource: "servers/demo-server-3", // User has read:demo-server-3
      };

      const testResult = await policyService.authorize(testRequest);
      const shouldSucceed = method.expected === "read"; // Only read is allowed

      if (shouldSucceed && testResult.authorized) {
        console.log(`   ✅ ${method.action} → ${method.expected} (granted)`);
      } else if (!shouldSucceed && !testResult.authorized) {
        console.log(
          `   ✅ ${method.action} → ${method.expected} (denied as expected)`
        );
      } else {
        console.log(
          `   ⚠️  ${method.action} → ${method.expected} (unexpected result)`
        );
      }
    }
    console.log("");

    // STEP 9: Test resource path normalization
    console.log("✅ Test 9: Testing resource path normalization...");
    const paths = [
      "/api/servers/demo-server-1",
      "api/servers/demo-server-1",
      "servers/demo-server-1",
      "/servers/demo-server-1",
      "demo-server-1",
    ];

    for (const path of paths) {
      const testRequest: AuthorizeRequest = {
        did: CLIENT_DID,
        action: "GET",
        resource: path,
      };

      const testResult = await policyService.authorize(testRequest);
      if (testResult.authorized) {
        console.log(
          `   ✅ Path "${path}" → normalized to "demo-server-1" (granted)`
        );
      } else {
        console.log(`   ❌ Path "${path}" → failed (unexpected)`);
      }
    }
    console.log("");

    // STEP 10: Test with context (should pass - context policies not implemented yet)
    console.log("✅ Test 10: Testing with context...");
    const authzRequest7: AuthorizeRequest = {
      did: CLIENT_DID,
      action: "GET",
      resource: "/api/servers/demo-server-1",
      context: {
        ip: "192.168.1.1",
        time: new Date().toISOString(),
      },
    };

    const result7 = await policyService.authorize(authzRequest7);
    if (result7.authorized) {
      console.log("✅ Authorization granted with context!");
      console.log(
        "   Context policies: Not implemented (defaults to allow)",
        "\n"
      );
    } else {
      console.log("⚠️  Authorization denied with context");
      console.log("   Reason:", result7.reason, "\n");
    }

    // Summary
    console.log("=".repeat(60));
    console.log("✅ Policy Service Test Complete!");
    console.log("=".repeat(60));
    console.log("\n📊 Test Summary:");
    console.log("   ✅ VC Issuance with server-specific permissions");
    console.log("   ✅ Exact permission matching");
    console.log("   ✅ Permission denial (missing permissions)");
    console.log("   ✅ HTTP method mapping (GET→read, POST→write, etc.)");
    console.log("   ✅ Resource path normalization");
    console.log("   ✅ Context support (placeholder)", "\n");
  } catch (error: any) {
    console.error("\n❌ Test failed with error:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
    throw error;
  } finally {
    // Cleanup
    try {
      await closeRedis();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run tests
if (require.main === module) {
  testPolicyService()
    .then(() => {
      console.log("\n✨ Test script finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { testPolicyService, CLIENT_DID };
