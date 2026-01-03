// src/test/services.test.ts
import { keyManagementService } from "@/services/key-management.service";
import { didResolverService } from "@/services/did-resolver.service";
import { log } from "@/lib/logger";

/**
 * Test Key Management Service
 */
async function testKeyManagement() {
  log.info("\n🧪 Testing Key Management Service...\n");

  try {
    // Test 1: Get private key
    log.info("Test 1: Get Private Key");
    const privateKey = await keyManagementService.getPrivateKey();
    log.info(
      `   ✅ Private key retrieved: ${privateKey.substring(0, 20)}...`
    );
    log.info(`   Length: ${privateKey.length} characters`);

    // Test 2: Verify it's hex format
    if (/^[0-9a-fA-F]+$/.test(privateKey)) {
      log.info("   ✅ Private key is valid hex format");
    } else {
      log.info("   ⚠️  Private key is not hex format");
    }

    // Test 3: Cache test (should return same key)
    const privateKey2 = await keyManagementService.getPrivateKey();
    if (privateKey === privateKey2) {
      log.info("   ✅ Caching works correctly");
    } else {
      log.info("   ❌ Caching failed");
    }

    // Test 4: Clear cache
    keyManagementService.clearCache();
    const privateKey3 = await keyManagementService.getPrivateKey();
    if (privateKey === privateKey3) {
      log.info("   ✅ Cache clear and re-fetch works");
    } else {
      log.info("   ❌ Cache clear failed");
    }

    return true;
  } catch (error: any) {
    log.error("   ❌ Key Management Test Failed:", error.message);
    return false;
  }
}

/**
 * Test DID Resolver Service
 */
async function testDIDResolver() {
  log.info("\n🧪 Testing DID Resolver Service...\n");

  // Test DID (use your actual DID)
  const testDID =
    process.env.TEST_DID ||
    "did:web:truganic.github.io:did-documents:clients:demo-client-1";

  try {
    // Test 1: Resolve DID (first time - should fetch from network)
    log.info(`Test 1: Resolve DID (${testDID})`);
    const result1 = await didResolverService.resolveDID({ did: testDID });

    if (result1.resolved) {
      log.info("   ✅ DID Resolution: SUCCESS");
      log.info(`   DID Document ID: ${result1.document.id}`);
      log.info(
        `   Verification Methods: ${
          result1.document.verificationMethod?.length || 0
        }`
      );
    } else {
      log.info("   ❌ DID Resolution: FAILED");
      return false;
    }

    // Test 2: Resolve again (should use cache)
    log.info("\nTest 2: Resolve DID (cached)");
    const startTime = Date.now();
    const result2 = await didResolverService.resolveDID({ did: testDID });
    const endTime = Date.now();

    if (result2.resolved) {
      log.info(
        `   ✅ Cached resolution: SUCCESS (${endTime - startTime}ms)`
      );
      if (endTime - startTime < 100) {
        log.info("   ✅ Cache is working (fast response)");
      }
    } else {
      log.info("   ❌ Cached resolution: FAILED");
      return false;
    }

    // Test 3: Verify document structure
    log.info("\nTest 3: Verify DID Document Structure");
    const doc = result2.document;

    if (doc["@context"] && Array.isArray(doc["@context"])) {
      log.info("   ✅ @context is valid");
    } else {
      log.info("   ❌ @context is missing or invalid");
    }

    if (doc.id === testDID) {
      log.info("   ✅ DID ID matches");
    } else {
      log.info("   ❌ DID ID mismatch");
    }

    if (doc.verificationMethod && doc.verificationMethod.length > 0) {
      log.info("   ✅ Verification methods present");
      const vm = doc.verificationMethod[0];
      if (vm.publicKeyJwk) {
        log.info("   ✅ Public key JWK found");
      } else {
        log.info("   ⚠️  No publicKeyJwk found");
      }
    } else {
      log.info("   ❌ No verification methods found");
    }

    // Test 4: Cache invalidation
    log.info("\nTest 4: Cache Invalidation");
    await didResolverService.invalidateCache(testDID);
    const result3 = await didResolverService.resolveDID({ did: testDID });

    if (result3.resolved) {
      log.info("   ✅ Cache invalidated and re-fetched successfully");
    } else {
      log.info("   ❌ Cache invalidation failed");
    }

    return true;
  } catch (error: any) {
    log.error("   ❌ DID Resolver Test Failed:", error.message);
    log.error("   Stack:", error.stack);
    return false;
  }
}

/**
 * Test integration between services
 */
async function testIntegration() {
  log.info("\n🧪 Testing Service Integration...\n");

  try {
    // Test: Use DID Resolver to get DID, then verify we can extract public key
    const testDID =
      process.env.TEST_DID ||
      "did:web:truganic.github.io:did-documents:clients:demo-client-1";

    log.info("Test: DID Resolver + Crypto Utils Integration");

    // Resolve DID
    const resolution = await didResolverService.resolveDID({ did: testDID });
    if (!resolution.resolved) {
      log.info("   ❌ Failed to resolve DID");
      return false;
    }

    // Import crypto utils
    const { extractPublicKeyFromDID } = await import("@/lib/crypto");

    // Extract public key
    const publicKeyInfo = extractPublicKeyFromDID(resolution.document);
    if (publicKeyInfo) {
      log.info("   ✅ Public key extracted from resolved DID");
      log.info(`   Algorithm: ${publicKeyInfo.algorithm}`);
      return true;
    } else {
      log.info("   ❌ Failed to extract public key");
      return false;
    }
  } catch (error: any) {
    log.error("   ❌ Integration Test Failed:", error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log.info("═══════════════════════════════════════════════════════");
  log.info("   Service Tests: Key Management + DID Resolver");
  log.info("═══════════════════════════════════════════════════════");

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
  log.info("\n═══════════════════════════════════════════════════════");
  log.info("   Test Summary");
  log.info("═══════════════════════════════════════════════════════");
  log.info(`✅ Key Management: ${results.keyManagement ? "PASS" : "FAIL"}`);
  log.info(`✅ DID Resolver: ${results.didResolver ? "PASS" : "FAIL"}`);
  log.info(`✅ Integration: ${results.integration ? "PASS" : "FAIL"}`);

  const allPassed = Object.values(results).every((r) => r === true);

  if (allPassed) {
    log.info("\n🎉 All tests passed!");
  } else {
    log.info("\n⚠️  Some tests failed. Check the errors above.");
  }

  log.info("═══════════════════════════════════════════════════════\n");

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  log.error("\n❌ Fatal error:", error);
  process.exit(1);
});
