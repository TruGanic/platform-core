-- CI / GitHub Actions: DDL only (no sample data). Apply to empty Postgres DB.

CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id SERIAL PRIMARY KEY,
    vc_id VARCHAR(255) UNIQUE NOT NULL,
    did VARCHAR(255) NOT NULL,
    plugin_id VARCHAR(255) NOT NULL,
    vc_data JSONB NOT NULL,
    jws TEXT,
    issuer_did VARCHAR(255) NOT NULL,
    issuance_date TIMESTAMP NOT NULL,
    expiration_date TIMESTAMP,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revocation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vc_revocation_list (
    id SERIAL PRIMARY KEY,
    vc_id VARCHAR(255) UNIQUE NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY (vc_id) REFERENCES verifiable_credentials(vc_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_did ON verifiable_credentials(did);
CREATE INDEX IF NOT EXISTS idx_vc_plugin_id ON verifiable_credentials(plugin_id);
CREATE INDEX IF NOT EXISTS idx_vc_revoked ON verifiable_credentials(revoked);
CREATE INDEX IF NOT EXISTS idx_vc_expiration ON verifiable_credentials(expiration_date);
CREATE INDEX IF NOT EXISTS idx_vc_issuer ON verifiable_credentials(issuer_did);

CREATE OR REPLACE FUNCTION update_vc_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_vc_timestamp_trigger ON verifiable_credentials;
CREATE TRIGGER update_vc_timestamp_trigger
    BEFORE UPDATE ON verifiable_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_vc_timestamp();

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

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_did ON audit_logs(did);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_logs(success);
