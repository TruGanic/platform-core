-- ============================================
-- Security Service Database Schema
-- ============================================
-- This creates tables for Verifiable Credentials, revocation, and audit logs

-- ============================================
-- Verifiable Credentials Table
-- ============================================
-- Stores all issued Verifiable Credentials (VCs)
CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id SERIAL PRIMARY KEY,
    vc_id VARCHAR(255) UNIQUE NOT NULL,
    did VARCHAR(255) NOT NULL,
    plugin_id VARCHAR(255) NOT NULL,
    vc_data JSONB NOT NULL,
    jws VARCHAR(5000), -- JWT string format
    issuer_did VARCHAR(255) NOT NULL,
    issuance_date TIMESTAMP NOT NULL,
    expiration_date TIMESTAMP,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revocation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- VC Revocation List Table
-- ============================================
-- Tracks revoked VCs (for revocation checking)
CREATE TABLE IF NOT EXISTS vc_revocation_list (
    id SERIAL PRIMARY KEY,
    vc_id VARCHAR(255) UNIQUE NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY (vc_id) REFERENCES verifiable_credentials(vc_id) ON DELETE CASCADE
);

-- ============================================
-- Indexes for Performance
-- ============================================
-- Index on DID (for looking up VCs by DID)
CREATE INDEX IF NOT EXISTS idx_vc_did ON verifiable_credentials(did);

-- Index on plugin_id (for looking up VCs by plugin)
CREATE INDEX IF NOT EXISTS idx_vc_plugin_id ON verifiable_credentials(plugin_id);

-- Index on revoked status (for filtering active VCs)
CREATE INDEX IF NOT EXISTS idx_vc_revoked ON verifiable_credentials(revoked);

-- Index on expiration_date (for filtering expired VCs)
CREATE INDEX IF NOT EXISTS idx_vc_expiration ON verifiable_credentials(expiration_date);

-- Index on issuer_did (for looking up VCs by issuer)
CREATE INDEX IF NOT EXISTS idx_vc_issuer ON verifiable_credentials(issuer_did);

-- ============================================
-- Auto-update Timestamp Function
-- ============================================
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vc_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger for Auto-update Timestamp
-- ============================================
-- Automatically updates updated_at when a VC is updated
CREATE TRIGGER update_vc_timestamp_trigger
    BEFORE UPDATE ON verifiable_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_vc_timestamp();

-- ============================================
-- Audit Logs Table
-- ============================================
-- Stores audit logs for authentication, VC issuance, etc.
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    did VARCHAR(255),
    success BOOLEAN NOT NULL,
    reason TEXT,
    ip_address VARCHAR(45),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Audit Logs
-- ============================================
-- Index on event_type (for filtering by event type)
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type);

-- Index on did (for looking up logs by DID)
CREATE INDEX IF NOT EXISTS idx_audit_did ON audit_logs(did);

-- Index on created_at (for time-based queries)
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- Index on success (for filtering successful/failed events)
CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_logs(success);

-- ============================================
-- Verification Queries (Optional - for testing)
-- ============================================
-- Uncomment these to verify tables were created:

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('verifiable_credentials', 'vc_revocation_list', 'audit_logs');

SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('verifiable_credentials', 'vc_revocation_list', 'audit_logs');


-- Insert a sample VC for testing
INSERT INTO verifiable_credentials (
    vc_id,
    did,
    plugin_id,
    vc_data,
    jws,
    issuer_did,
    issuance_date,
    expiration_date,
    revoked
) VALUES (
    'vc-test-001',
    'did:web:truganic.github.io:did-documents:clients:demo-client-1',
    'demo-client-1',
    '{
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "PluginPermissionCredential"],
        "issuer": "did:web:truganic.github.io:did-documents:core",
        "credentialSubject": {
            "id": "did:web:truganic.github.io:did-documents:clients:demo-client-1",
            "pluginId": "demo-client-1",
            "permissions": ["read:data", "write:data"],
            "version": "1.0.0"
        },
        "issuanceDate": "2025-12-30T10:00:00Z",
        "expirationDate": "2026-12-30T10:00:00Z"
    }'::jsonb,
    'eyJhbGciOiJFUzI1NksifQ.eyJpc3MiOiJkaWQ6d2ViOnRydWdhbmljLmdpdGh1Yi5pbyIsInN1YiI6ImRpZDp3ZWI6dHJ1Z2FuaWMuZ2l0aHViLmlvIiwiY3JlZGVudGlhbFN1YmplY3QiOnsiaWQiOiJkaWQ6d2ViOnRydWdhbmljLmdpdGh1Yi5pbyJ9fQ.test-signature',
    'did:web:truganic.github.io:did-documents:core',
    '2025-12-30 10:00:00',
    '2026-12-30 10:00:00',
    false
);

-- Delete all data (in correct order due to foreign keys)
DELETE FROM vc_revocation_list;
DELETE FROM audit_logs;
DELETE FROM verifiable_credentials;