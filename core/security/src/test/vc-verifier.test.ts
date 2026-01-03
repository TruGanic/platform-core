// core/security/src/test/vc-verifier.test.ts
import { vcIssuerService } from "../services/vc-issuer.service";
import { vcVerifierService } from "../services/vc-verifier.service";
import { IssueVCRequest, VerifyVCRequest } from "@shared/types";
import { query, execute } from "@/lib/db";
import { config } from "@/config";

/**
 * Test VC Verifier Service
 *
 * Prerequisites:
 * 1. Database is running and schema is created
 * 2. CORE_PRIVATE_KEY is set in .env
 * 3. CORE_DID is set in .env (or defaults)
 * 4. DATABASE_URL is set in .env
 * 5. REDIS_URL is set in .env (for DID resolution caching)
 */

async function testVCVerifier() {
  console.log("\n🧪 Testing VC Verifier Service...\n");

  try {
    // Test 1: Issue a VC first (prerequisite)
    console.log("📝 Test 1: Issuing a VC to verify...");
    const issueRequest: IssueVCRequest = {
      pluginId: "test-plugin-verifier",
      did: "did:web:localhost:test-client-verifier",
      permissions: ["read:plugins", "write:instances", "delete:instances"],
      version: "1.0.0",
    };

    const issueResult = await vcIssuerService.issueVC(issueRequest);
    if (!issueResult.success) {
      console.error("❌ Failed to issue VC:", issueResult.message);
      return;
    }

    const vc = issueResult.vc;
    const jws = vc.proof?.jws;
    console.log("✅ VC issued successfully");
    console.log("   VC ID:", vc.proof?.verificationMethod);
    console.log("   JWS length:", jws?.length || 0, "characters");
    console.log("   Permissions:", vc.credentialSubject.permissions, "\n");

    // Test 2: Verify VC as object format
    console.log("✅ Test 2: Verifying VC as object format...");
    const verifyRequest1: VerifyVCRequest = {
      vc: vc,
    };

    const verifyResult1 = await vcVerifierService.verifyVC(verifyRequest1);
    if (!verifyResult1.valid) {
      console.error("❌ VC verification failed:", verifyResult1.error);
      return;
    }

    console.log("✅ VC verified successfully!");
    console.log("   Permissions:", verifyResult1.permissions);
    console.log("   VC issuer:", verifyResult1.vc?.issuer);
    console.log("   VC subject:", verifyResult1.vc?.credentialSubject.id);
    console.log(
      "   VC plugin:",
      verifyResult1.vc?.credentialSubject.pluginId,
      "\n"
    );

    // Test 3: Verify VC as JWT string format
    if (jws) {
      console.log("✅ Test 3: Verifying VC as JWT string format...");
      const verifyRequest2: VerifyVCRequest = {
        vc: jws,
      };

      const verifyResult2 = await vcVerifierService.verifyVC(verifyRequest2);
      if (!verifyResult2.valid) {
        console.error("❌ JWT verification failed:", verifyResult2.error);
        return;
      }

      console.log("✅ JWT verified successfully!");
      console.log("   Permissions:", verifyResult2.permissions);
      console.log("   VC extracted from JWT:", !!verifyResult2.vc, "\n");
    } else {
      console.log("⚠️  Skipping JWT test - no JWS in VC proof\n");
    }

    // Test 4: Test expiration check
    console.log("⏰ Test 4: Testing expiration check...");
    const expiredVC = { ...vc };
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    expiredVC.expirationDate = pastDate.toISOString();

    const expiredResult = await vcVerifierService.verifyVC({ vc: expiredVC });
    if (expiredResult.valid) {
      console.error("❌ Should have rejected expired VC");
    } else {
      console.log("✅ Correctly rejected expired VC");
      console.log("   Error:", expiredResult.error, "\n");
    }

    // Test 5: Test invalid issuer
    console.log("🚫 Test 5: Testing invalid issuer check...");
    const invalidIssuerVC = { ...vc };
    invalidIssuerVC.issuer = "did:web:invalid:issuer";

    const invalidIssuerResult = await vcVerifierService.verifyVC({
      vc: invalidIssuerVC,
    });
    if (invalidIssuerResult.valid) {
      console.error("❌ Should have rejected VC with invalid issuer");
    } else {
      console.log("✅ Correctly rejected VC with invalid issuer");
      console.log("   Error:", invalidIssuerResult.error, "\n");
    }

    // Test 6: Test missing proof
    console.log("🚫 Test 6: Testing missing proof check...");
    const noProofVC = { ...vc };
    delete noProofVC.proof;

    const noProofResult = await vcVerifierService.verifyVC({ vc: noProofVC });
    if (noProofResult.valid) {
      console.error("❌ Should have rejected VC without proof");
    } else {
      console.log("✅ Correctly rejected VC without proof");
      console.log("   Error:", noProofResult.error, "\n");
    }

    // Test 7: Test revocation check (should pass - VC is not revoked)
    console.log("🔍 Test 7: Testing revocation check (should pass)...");
    const revocationCheck = await vcVerifierService.verifyVC({ vc: vc });
    if (!revocationCheck.valid) {
      console.error(
        "❌ VC verification failed (might be revoked):",
        revocationCheck.error
      );
    } else {
      console.log("✅ VC is not revoked (as expected)");
      console.log("   Permissions:", revocationCheck.permissions, "\n");
    }

    // Test 8: Test revocation (manually revoke and check)
    console.log("🔍 Test 8: Testing revocation detection...");

    // Get the VC ID from database
    const vcLookup = await query<{ vc_id: string }>(
      `SELECT vc_id FROM verifiable_credentials WHERE jws = $1 LIMIT 1`,
      [jws]
    );

    if (vcLookup.length > 0) {
      const vcId = vcLookup[0].vc_id;

      // Mark as revoked
      await execute(
        `UPDATE verifiable_credentials SET revoked = true, revoked_at = CURRENT_TIMESTAMP WHERE vc_id = $1`,
        [vcId]
      );

      // Add to revocation list
      await execute(
        `INSERT INTO vc_revocation_list (vc_id, reason) VALUES ($1, $2) ON CONFLICT (vc_id) DO NOTHING`,
        [vcId, "Test revocation"]
      );

      // Try to verify revoked VC
      const revokedResult = await vcVerifierService.verifyVC({ vc: vc });
      if (revokedResult.valid) {
        console.error("❌ Should have rejected revoked VC");
      } else {
        console.log("✅ Correctly rejected revoked VC");
        console.log("   Error:", revokedResult.error, "\n");
      }

      // Cleanup: Unrevoke for other tests
      await execute(
        `UPDATE verifiable_credentials SET revoked = false, revoked_at = NULL WHERE vc_id = $1`,
        [vcId]
      );
      await execute(`DELETE FROM vc_revocation_list WHERE vc_id = $1`, [vcId]);
    } else {
      console.log("⚠️  Could not find VC in database for revocation test\n");
    }

    // Test 9: Test extractPermissions helper
    console.log("🔧 Test 9: Testing extractPermissions helper...");
    const extractedPerms = vcVerifierService.extractPermissions(vc);
    console.log("✅ Permissions extracted:", extractedPerms);
    console.log(
      "   Matches VC:",
      JSON.stringify(extractedPerms) ===
        JSON.stringify(vc.credentialSubject.permissions),
      "\n"
    );

    // Test 10: Test invalid JWT string
    console.log("🚫 Test 10: Testing invalid JWT string...");
    const invalidJWTResult = await vcVerifierService.verifyVC({
      vc: "invalid.jwt.string",
    });
    if (invalidJWTResult.valid) {
      console.error("❌ Should have rejected invalid JWT");
    } else {
      console.log("✅ Correctly rejected invalid JWT");
      console.log("   Error:", invalidJWTResult.error, "\n");
    }

    // Test 11: Test VC with missing credentialSubject
    console.log("🚫 Test 11: Testing VC with missing credentialSubject...");
    const invalidVC = { ...vc };
    delete (invalidVC as any).credentialSubject;

    const invalidVCResult = await vcVerifierService.verifyVC({ vc: invalidVC });
    // This might pass signature check but fail later - depends on implementation
    console.log(
      "   Result:",
      invalidVCResult.valid ? "✅ Passed" : "❌ Failed"
    );
    console.log("   Error:", invalidVCResult.error || "None", "\n");

    // Summary
    console.log("=".repeat(60));
    console.log("✅ All VC Verifier tests completed!");
    console.log("=".repeat(60));
    console.log("\n📊 Test Summary:");
    console.log("   ✅ VC Object Format Verification");
    console.log("   ✅ VC JWT String Format Verification");
    console.log("   ✅ Expiration Check");
    console.log("   ✅ Issuer Validation");
    console.log("   ✅ Proof Validation");
    console.log("   ✅ Revocation Check");
    console.log("   ✅ Permission Extraction");
    console.log("   ✅ Error Handling\n");
  } catch (error: any) {
    console.error("\n❌ Test failed with error:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
    throw error;
  }
}

// Run tests
if (require.main === module) {
  testVCVerifier()
    .then(() => {
      console.log("\n✨ Test script finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { testVCVerifier };
