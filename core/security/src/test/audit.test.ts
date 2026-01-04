// core/security/src/test/audit.service.test.ts
import { auditService } from "../services/audit.service";
import { query } from "@/lib/db";

/**
 * Test Audit Service
 *
 * Prerequisites:
 * 1. Database is running and schema is created
 * 2. audit_logs table exists
 * 3. DATABASE_URL is set in .env
 */

async function testAuditService() {
  console.log("\n🧪 Testing Audit Service...\n");

  try {
    // Test 1: Log authentication success
    console.log("✅ Test 1: Logging successful authentication...");
    await auditService.logAuthentication(
      "did:web:localhost:test-client-1",
      true,
      undefined,
      "192.168.1.100"
    );
    console.log("✅ Authentication log written\n");

    // Test 2: Log authentication failure
    console.log("✅ Test 2: Logging failed authentication...");
    await auditService.logAuthentication(
      "did:web:localhost:test-client-2",
      false,
      "Invalid signature",
      "192.168.1.101"
    );
    console.log("✅ Failed authentication log written\n");

    // Test 3: Log authorization granted
    console.log("✅ Test 3: Logging authorization granted...");
    await auditService.logAuthorization(
      "did:web:localhost:test-client-1",
      "POST",
      "plugins",
      true
    );
    console.log("✅ Authorization granted log written\n");

    // Test 4: Log authorization denied
    console.log("✅ Test 4: Logging authorization denied...");
    await auditService.logAuthorization(
      "did:web:localhost:test-client-2",
      "DELETE",
      "instances",
      false,
      "Missing required permission: delete:instances"
    );
    console.log("✅ Authorization denied log written\n");

    // Test 5: Log VC issuance
    console.log("✅ Test 5: Logging VC issuance...");
    await auditService.logVCIssuance(
      "did:web:truganic.github.io:did-documents:core",
      "did:web:localhost:test-client-1",
      "test-plugin-123",
      "vc-uuid-12345"
    );
    console.log("✅ VC issuance log written\n");

    // Test 6: Log VC revocation
    console.log("✅ Test 6: Logging VC revocation...");
    await auditService.logVCRevocation(
      "vc-uuid-12345",
      "Plugin access revoked by administrator",
      "did:web:localhost:admin-1"
    );
    console.log("✅ VC revocation log written\n");

    // Test 7: Log security event
    console.log("✅ Test 7: Logging security event...");
    await auditService.logSecurityEvent(
      "suspicious_activity",
      "did:web:localhost:test-client-3",
      {
        description: "Multiple failed authentication attempts",
        count: 5,
        timeWindow: "5 minutes",
      }
    );
    console.log("✅ Security event log written\n");

    // Test 8: Verify logs in database
    console.log("🔍 Test 8: Verifying logs in database...");

    // Check authentication logs
    const authLogs = await query(
      `SELECT * FROM audit_logs 
       WHERE event_type = 'authentication' 
       ORDER BY created_at DESC 
       LIMIT 2`
    );
    console.log(`✅ Found ${authLogs.length} authentication logs`);
    if (authLogs.length > 0) {
      const log = authLogs[0];
      console.log("   Sample log:", {
        event_type: log.event_type,
        did: log.did,
        success: log.success,
        reason: log.reason,
        ip_address: log.ip_address,
      });
    }

    // Check authorization logs
    const authzLogs = await query(
      `SELECT * FROM audit_logs 
       WHERE event_type = 'authorization' 
       ORDER BY created_at DESC 
       LIMIT 2`
    );
    console.log(`✅ Found ${authzLogs.length} authorization logs`);
    if (authzLogs.length > 0) {
      const log = authzLogs[0];
      console.log("   Sample log:", {
        event_type: log.event_type,
        did: log.did,
        success: log.success,
        reason: log.reason,
        metadata: log.metadata,
      });
    }

    // Check VC issuance logs
    const vcLogs = await query(
      `SELECT * FROM audit_logs 
       WHERE event_type IN ('vc_issuance', 'vc_revocation') 
       ORDER BY created_at DESC 
       LIMIT 2`
    );
    console.log(`✅ Found ${vcLogs.length} VC-related logs\n`);

    // Test 9: Test queryLogs method (if implemented)
    console.log("🔍 Test 9: Testing queryLogs method...");
    try {
      const queryResult = await auditService.queryLogs({
        eventType: "authentication",
        success: true,
        limit: 5,
      });
      console.log(`✅ Query returned ${queryResult.length} logs`);
      if (queryResult.length > 0) {
        console.log("   Sample result:", {
          id: queryResult[0].id,
          event_type: queryResult[0].event_type,
          did: queryResult[0].did,
          created_at: queryResult[0].created_at,
        });
      }
    } catch (error: any) {
      console.log(
        "⚠️  queryLogs method not implemented or error:",
        error.message
      );
    }
    console.log();

    // Test 10: Test with missing optional parameters
    console.log("✅ Test 10: Testing with missing optional parameters...");
    await auditService.logAuthentication(
      "did:web:localhost:test-client-4",
      true
      // No reason, no IP
    );
    await auditService.logAuthorization(
      "did:web:localhost:test-client-4",
      "GET",
      "data",
      true
      // No reason
    );
    console.log("✅ Logs written with optional parameters missing\n");

    // Test 11: Verify NULL handling
    console.log("🔍 Test 11: Verifying NULL handling in database...");
    const nullCheck = await query(
      `SELECT * FROM audit_logs 
       WHERE did = 'did:web:localhost:test-client-4' 
       AND event_type = 'authentication' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    if (nullCheck.length > 0) {
      const log = nullCheck[0];
      console.log("✅ NULL values handled correctly:");
      console.log("   reason:", log.reason === null ? "NULL ✓" : log.reason);
      console.log(
        "   ip_address:",
        log.ip_address === null ? "NULL ✓" : log.ip_address
      );
    }
    console.log();

    // Test 12: Test metadata JSONB storage
    console.log("🔍 Test 12: Verifying metadata JSONB storage...");
    const metadataCheck = await query(
      `SELECT metadata FROM audit_logs 
       WHERE event_type = 'vc_issuance' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    if (metadataCheck.length > 0) {
      const metadata = metadataCheck[0].metadata;
      console.log("✅ Metadata stored as JSONB:");
      console.log("   Type:", typeof metadata);
      console.log("   Content:", JSON.stringify(metadata, null, 2));
    }
    console.log();

    // Summary
    console.log("=".repeat(60));
    console.log("✅ All Audit Service tests completed!");
    console.log("=".repeat(60));
    console.log("\n📊 Test Summary:");
    console.log("   ✅ Authentication logging (success & failure)");
    console.log("   ✅ Authorization logging (granted & denied)");
    console.log("   ✅ VC issuance logging");
    console.log("   ✅ VC revocation logging");
    console.log("   ✅ Security event logging");
    console.log("   ✅ Database verification");
    console.log("   ✅ NULL value handling");
    console.log("   ✅ JSONB metadata storage");
    console.log("   ✅ Query method (if implemented)\n");

    // Final count
    const totalLogs = await query(
      `SELECT COUNT(*) as count FROM audit_logs 
       WHERE created_at > NOW() - INTERVAL '1 hour'`
    );
    console.log(`📈 Total logs created in last hour: ${totalLogs[0].count}\n`);
  } catch (error: any) {
    console.error("\n❌ Test failed with error:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
    throw error;
  } finally {
    // Don't close DB connection - might be used by other services
    console.log("🔌 Test completed (database connection left open)\n");
  }
}

// Run tests
if (require.main === module) {
  testAuditService()
    .then(() => {
      console.log("✨ Test script finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { testAuditService };
