// core/security/src/test/vc-issuer.test.ts
import { vcIssuerService } from "@/services/vc-issuer.service";
import { IssueVCRequest } from "@shared/types";
import { query, closePool } from "@/lib/db";
import { keyManagementService } from "../services/key-management.service";

/**
 * Test VC Issuer Service
 *
 * Prerequisites:
 * 1. Database is running and schema is created
 * 2. CORE_PRIVATE_KEY is set in .env
 * 3. CORE_DID is set in .env (or defaults to did:web:localhost:core)
 * 4. DATABASE_URL is set in .env
 */

async function testVCIssuance() {
  console.log("\n🧪 Testing VC Issuer Service...\n");

  try {
    // Test 1: Check database connection
    console.log("📊 Test 1: Checking database connection...");
    await query("SELECT NOW()");
    console.log("✅ Database connection OK\n");

    // Test 2: Check private key availability
    console.log("🔑 Test 2: Checking private key...");
    try {
      const privateKey = await keyManagementService.getPrivateKey();
      if (!privateKey || privateKey.length < 64) {
        throw new Error("Private key is invalid or too short");
      }
      console.log(
        "✅ Private key available (length:",
        privateKey.length,
        ")\n"
      );
    } catch (error: any) {
      console.error("❌ Private key error:", error.message);
      console.error("   Make sure CORE_PRIVATE_KEY is set in .env\n");
      return;
    }

    // Test 3: Issue a VC with valid data
    console.log("📝 Test 3: Issuing VC with valid data...");
    const validRequest: IssueVCRequest = {
      pluginId: "test-plugin-123",
      did: "did:web:localhost:test-client",
      permissions: ["read:plugins", "write:instances"],
      version: "1.0.0",
    };

    const result = await vcIssuerService.issueVC(validRequest);

    if (!result.success) {
      console.error("❌ VC issuance failed:", result.message);
      return;
    }

    console.log("✅ VC issued successfully!");
    console.log("   VC ID:", result.vc["@context"]);
    console.log("   Issuer:", result.vc.issuer);
    console.log("   Subject:", result.vc.credentialSubject.id);
    console.log("   Permissions:", result.vc.credentialSubject.permissions);
    console.log("   Has JWS:", !!result.vc.proof?.jws);
    console.log(
      "   JWS length:",
      result.vc.proof?.jws?.length || 0,
      "characters\n"
    );

    // Test 4: Verify VC was stored in database
    console.log("💾 Test 4: Verifying VC storage in database...");
    const dbResult = await query<{
      vc_id: string;
      did: string;
      plugin_id: string;
      jws: string;
      issuer_did: string;
      issuance_date: string;
      expiration_date: string;
    }>(
      `SELECT vc_id, did, plugin_id, jws, issuer_did, issuance_date, expiration_date 
       FROM verifiable_credentials 
       WHERE did = $1 AND plugin_id = $2 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [validRequest.did, validRequest.pluginId]
    );

    if (dbResult.length === 0) {
      console.error("❌ VC not found in database");
      return;
    }

    const storedVC = dbResult[0];
    console.log("✅ VC found in database:");
    console.log("   VC ID:", storedVC.vc_id);
    console.log("   DID:", storedVC.did);
    console.log("   Plugin ID:", storedVC.plugin_id);
    console.log("   Issuer DID:", storedVC.issuer_did);
    console.log("   Issuance Date:", storedVC.issuance_date);
    console.log("   Expiration Date:", storedVC.expiration_date);
    console.log("   JWS stored:", !!storedVC.jws);
    console.log("   JWS length:", storedVC.jws?.length || 0, "characters\n");

    // Test 5: Test validation - missing permissions
    console.log("🚫 Test 5: Testing validation (empty permissions)...");
    const invalidRequest1: IssueVCRequest = {
      pluginId: "test-plugin-456",
      did: "did:web:localhost:test-client-2",
      permissions: [], // Empty permissions
    };

    const result2 = await vcIssuerService.issueVC(invalidRequest1);
    if (result2.success) {
      console.error("❌ Validation failed - should reject empty permissions");
    } else {
      console.log("✅ Validation working - rejected empty permissions");
      console.log("   Error:", result2.message, "\n");
    }

    // Test 6: Test validation - missing required fields
    console.log("🚫 Test 6: Testing validation (missing fields)...");
    const invalidRequest2: any = {
      pluginId: "test-plugin-789",
      // Missing did and permissions
    };

    const result3 = await vcIssuerService.issueVC(invalidRequest2);
    if (result3.success) {
      console.error("❌ Validation failed - should reject missing fields");
    } else {
      console.log("✅ Validation working - rejected missing fields");
      console.log("   Error:", result3.message, "\n");
    }

    // Test 7: Issue VC with custom expiration
    console.log("📅 Test 7: Issuing VC with custom expiration date...");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6); // 6 months from now

    const customExpRequest: IssueVCRequest = {
      pluginId: "test-plugin-custom-exp",
      did: "did:web:localhost:test-client-3",
      permissions: ["read:plugins"],
      expirationDate: futureDate.toISOString(),
    };

    const result4 = await vcIssuerService.issueVC(customExpRequest);
    if (!result4.success) {
      console.error(
        "❌ Failed to issue VC with custom expiration:",
        result4.message
      );
    } else {
      console.log("✅ VC with custom expiration issued");
      console.log("   Expiration:", result4.vc.expirationDate);
      console.log(
        "   Matches request:",
        result4.vc.expirationDate === customExpRequest.expirationDate,
        "\n"
      );
    }

    // Summary
    console.log("=".repeat(50));
    console.log("✅ All tests completed!");
    console.log("=".repeat(50));
  } catch (error: any) {
    console.error("\n❌ Test failed with error:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
  } finally {
    // Cleanup: Close database connection
    await closePool();
    console.log("\n🔌 Database connection closed");
  }
}

// Run tests
if (require.main === module) {
  testVCIssuance()
    .then(() => {
      console.log("\n✨ Test script finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { testVCIssuance };
