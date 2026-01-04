// src/test/services.test.ts
import { keyManagementService } from "@/services/key-management.service";
import { didResolverService } from "@/services/did-resolver.service";

/**
 * Test Key Management Service
 */
async function testKeyManagement() {
  console.log("\n🧪 Testing Key Management Service...\n");

  try {
    // Test 1: Get private key
    console.log("Test 1: Get Private Key");
    const privateKey = await keyManagementService.getPrivateKey();
    console.log(
      `   ✅ Private key retrieved: ${privateKey.substring(0, 20)}...`
    );
    console.log(`   Length: ${privateKey.length} characters`);

    // Test 2: Verify it's hex format
    if (/^[0-9a-fA-F]+$/.test(privateKey)) {
      console.log("   ✅ Private key is valid hex format");
    } else {
      console.log("   ⚠️  Private key is not hex format");
    }

    // Test 3: Cache test (should return same key)
    const privateKey2 = await keyManagementService.getPrivateKey();
    if (privateKey === privateKey2) {
      console.log("   ✅ Caching works correctly");
    } else {
      console.log("   ❌ Caching failed");
    }

    // Test 4: Clear cache
    keyManagementService.clearCache();
    const privateKey3 = await keyManagementService.getPrivateKey();
    if (privateKey === privateKey3) {
      console.log("   ✅ Cache clear and re-fetch works");
    } else {
      console.log("   ❌ Cache clear failed");
    }

    return true;
  } catch (error: any) {
    console.error("   ❌ Key Management Test Failed:", error.message);
    return false;
  }
}

/**
 * Test DID Resolver Service
 */
async function testDIDResolver() {
  console.log("\n🧪 Testing DID Resolver Service...\n");

  // Test DID (use your actual DID)
  const testDID =
    process.env.TEST_DID ||
    "did:web:truganic.github.io:did-documents:clients:demo-client-1";

  try {
    // Test 1: Resolve DID (first time - should fetch from network)
    console.log(`Test 1: Resolve DID (${testDID})`);
    const result1 = await didResolverService.resolveDID({ did: testDID });

    if (result1.resolved) {
      console.log("   ✅ DID Resolution: SUCCESS");
      console.log(`   DID Document ID: ${result1.document.id}`);
      console.log(
        `   Verification Methods: ${
          result1.document.verificationMethod?.length || 0
        }`
      );
    } else {
      console.log("   ❌ DID Resolution: FAILED");
      return false;
    }

    // Test 2: Resolve again (should use cache)
    console.log("\nTest 2: Resolve DID (cached)");
    const startTime = Date.now();
    const result2 = await didResolverService.resolveDID({ did: testDID });
    const endTime = Date.now();

    if (result2.resolved) {
      console.log(
        `   ✅ Cached resolution: SUCCESS (${endTime - startTime}ms)`
      );
      if (endTime - startTime < 100) {
        console.log("   ✅ Cache is working (fast response)");
      }
    } else {
      console.log("   ❌ Cached resolution: FAILED");
      return false;
    }

    // Test 3: Verify document structure
    console.log("\nTest 3: Verify DID Document Structure");
    const doc = result2.document;

    if (doc["@context"] && Array.isArray(doc["@context"])) {
      console.log("   ✅ @context is valid");
    } else {
      console.log("   ❌ @context is missing or invalid");
    }

    if (doc.id === testDID) {
      console.log("   ✅ DID ID matches");
    } else {
      console.log("   ❌ DID ID mismatch");
    }

    if (doc.verificationMethod && doc.verificationMethod.length > 0) {
      console.log("   ✅ Verification methods present");
      const vm = doc.verificationMethod[0];
      if (vm.publicKeyJwk) {
        console.log("   ✅ Public key JWK found");
      } else {
        console.log("   ⚠️  No publicKeyJwk found");
      }
    } else {
      console.log("   ❌ No verification methods found");
    }

    // Test 4: Cache invalidation
    console.log("\nTest 4: Cache Invalidation");
    await didResolverService.invalidateCache(testDID);
    const result3 = await didResolverService.resolveDID({ did: testDID });

    if (result3.resolved) {
      console.log("   ✅ Cache invalidated and re-fetched successfully");
    } else {
      console.log("   ❌ Cache invalidation failed");
    }

    return true;
  } catch (error: any) {
    console.error("   ❌ DID Resolver Test Failed:", error.message);
    console.error("   Stack:", error.stack);
    return false;
  }
}

/**
 * Test integration between services
 */
async function testIntegration() {
  console.log("\n🧪 Testing Service Integration...\n");

  try {
    // Test: Use DID Resolver to get DID, then verify we can extract public key
    const testDID =
      process.env.TEST_DID ||
      "did:web:truganic.github.io:did-documents:clients:demo-client-1";

    console.log("Test: DID Resolver + Crypto Utils Integration");

    // Resolve DID
    const resolution = await didResolverService.resolveDID({ did: testDID });
    if (!resolution.resolved) {
      console.log("   ❌ Failed to resolve DID");
      return false;
    }

    // Import crypto utils
    const { extractPublicKeyFromDID } = await import("@/lib/crypto");

    // Extract public key
    const publicKeyInfo = extractPublicKeyFromDID(resolution.document);
    if (publicKeyInfo) {
      console.log("   ✅ Public key extracted from resolved DID");
      console.log(`   Algorithm: ${publicKeyInfo.algorithm}`);
      return true;
    } else {
      console.log("   ❌ Failed to extract public key");
      return false;
    }
  } catch (error: any) {
    console.error("   ❌ Integration Test Failed:", error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("   Service Tests: Key Management + DID Resolver");
  console.log("═══════════════════════════════════════════════════════");

  const results = {
    keyManagement: false,
    didResolver: false,
    integration: false,
  };

  // Test Key Management
  results.keyManagement = await testKeyManagement();

  // Test DID Resolver
  results.didResolver = await testDIDResolver();

  // Test Integration
  results.integration = await testIntegration();

  // Summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("   Test Summary");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`✅ Key Management: ${results.keyManagement ? "PASS" : "FAIL"}`);
  console.log(`✅ DID Resolver: ${results.didResolver ? "PASS" : "FAIL"}`);
  console.log(`✅ Integration: ${results.integration ? "PASS" : "FAIL"}`);

  const allPassed = Object.values(results).every((r) => r === true);

  if (allPassed) {
    console.log("\n🎉 All tests passed!");
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
  }

  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
