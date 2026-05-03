# Security Service

A comprehensive security service for the TruGanic platform that provides DID/VC-based authentication, authorization, and verifiable credential management.

## Overview

The Security Service is a core microservice that handles:

- **Authentication**: Verifies requests using DID signatures and cryptographic verification
- **Authorization**: Evaluates permissions based on Verifiable Credentials (VCs)
- **DID Resolution**: Resolves Decentralized Identifiers (DIDs) to DID documents
- **VC Management**: Issues, verifies, and revokes Verifiable Credentials
- **Audit Logging**: Tracks all security events for compliance and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Service                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Routes     │  │   Services   │  │   Libraries  │       │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤       │
│  │ /api/auth    │  │ Authenticator│  │   Crypto     │       │
│  │ /api/did     │  │   Policy     │  │   Database   │       │
│  │ /api/vc      │  │ DID Resolver │  │   Cache      │       │
│  │              │  │ VC Issuer    │  │   Logger     │       │
│  │              │  │ VC Verifier  │  │   Veramo     │       │
│  │              │  │   Audit      │  │              │       │
│  │              │  │ Key Mgmt     │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    PostgreSQL            Redis Cache          External DIDs
```

## Features

### 🔐 Authentication

- DID-based request authentication
- Cryptographic signature verification
- Nonce-based replay attack prevention
- Timestamp validation for request freshness
- VC-based permission extraction

### 🛡️ Authorization

- Policy-based access control
- Permission matching with wildcard support
- Context-aware policy evaluation
- Resource-action mapping

### 🆔 DID Resolution

- Web DID resolution using Veramo
- Redis caching for performance
- Cache invalidation support
- DID document retrieval

### 📜 Verifiable Credentials

- VC issuance with JWT signing
- VC verification (JWT and object formats)
- VC revocation with audit trail
- Expiration date management
- Revocation list checking

### 📊 Audit Logging

- Authentication attempts
- Authorization decisions
- VC issuance and revocation
- Security events
- Database-backed audit trail

## API Endpoints

### Authentication

#### `POST /api/auth/authenticate`

Authenticate a request using DID signature verification.

**Request Body:**

```json
{
  "did": "did:web:...:client-1",
  "signature": "base64-signature",
  "request": {
    "method": "POST",
    "path": "/api/plugins",
    "body": {...},
    "headers": {...},
    "timestamp": "2024-01-15T10:00:00Z",
    "nonce": "uuid-1234"
  }
}
```

**Response:**

```json
{
  "valid": true,
  "permissions": ["read:demo-server-1", "write:demo-server-2"]
}
```

#### `POST /api/auth/authorize`

Authorize an action on a resource.

**Request Body:**

```json
{
  "did": "did:web:...:client-1",
  "action": "POST",
  "resource": "/api/servers/demo-server-2",
  "context": {
    "ip": "192.168.1.1",
    "time": "2024-01-15T10:00:00Z"
  }
}
```

**Response:**

```json
{
  "authorized": true
}
```

### DID Resolution

#### `POST /api/did/resolve`

Resolve a DID to its DID document.

**Request Body:**

```json
{
  "did": "did:web:truganic.github.io:did-documents:clients:ci-automation-client"
}
```

**Response:**

```json
{
  "did": "did:web:...:client-1",
  "document": {
    "@context": "https://www.w3.org/2018/credentials/v1",
    "id": "did:web:...:client-1",
    "verificationMethod": [...],
    "authentication": [...]
  },
  "resolved": true
}
```

#### `POST /api/did/invalidate`

Invalidate cached DID document.

**Request Body:**

```json
{
  "did": "did:web:...:client-1"
}
```

### Verifiable Credentials

#### `POST /api/vc/issue`

Issue a Verifiable Credential.

**Request Body:**

```json
{
  "pluginId": "demo-plugin-1",
  "did": "did:web:...:client-1",
  "permissions": ["read:demo-server-1", "write:demo-server-2"],
  "version": "1.0.0",
  "expirationDate": "2025-01-15T10:00:00Z"
}
```

**Response:**

```json
{
  "success": true,
  "vc": {
    "@context": [...],
    "type": ["VerifiableCredential", "PluginPermissionCredential"],
    "issuer": "did:web:...:core",
    "credentialSubject": {
      "id": "did:web:...:client-1",
      "pluginId": "demo-plugin-1",
      "permissions": ["read:demo-server-1", "write:demo-server-2"]
    },
    "issuanceDate": "2024-01-15T10:00:00Z",
    "expirationDate": "2025-01-15T10:00:00Z",
    "proof": {...}
  },
  "message": "VC issued successfully"
}
```

#### `POST /api/vc/verify`

Verify a Verifiable Credential.

**Request Body:**

```json
{
  "vc": "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ..." // JWT string
  // OR
  "vc": {
    "issuer": "did:web:...:core-1",
    "credentialSubject": {...},
    "proof": {...}
  }
}
```

**Response:**

```json
{
  "valid": true,
  "vc": {...},
  "permissions": ["read:demo-server-1", "write:demo-server-2"]
}
```

#### `POST /api/vc/revoke`

Revoke a Verifiable Credential.

**Request Body:**

```json
{
  "vcId": "uuid-or-jws-string",
  "reason": "Security breach"
}
```

**Response:**

```json
{
  "success": true,
  "message": "VC revoked successfully",
  "vcId": "uuid-1234"
}
```

### Health Check

#### `GET /health`

Service health check endpoint.

**Response:**

```json
{
  "service": "Security Service",
  "status": "active",
  "env": "development",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## Services

### AuthenticatorService

Handles request authentication:

- DID resolution
- Signature verification
- Nonce validation
- Timestamp validation
- VC retrieval and verification

### PolicyService

Evaluates authorization policies:

- Permission mapping (action + resource → permission)
- Wildcard permission matching
- Context-aware policy evaluation

### DIDResolverService

Resolves DIDs to DID documents:

- Web DID resolution via Veramo
- Redis caching (1 hour TTL)
- Cache invalidation

### VCIssuerService

Issues Verifiable Credentials:

- VC structure creation
- JWT signing (ES256K)
- Database storage
- Default expiration (1 year)

### VCVerifierService

Verifies Verifiable Credentials:

- JWT verification
- Proof signature validation
- Expiration checking
- Revocation status checking
- Permission extraction

### AuditService

Logs security events:

- Authentication attempts
- Authorization decisions
- VC issuance/revocation
- Security events
- Queryable audit logs

### KeyManagementService

Manages cryptographic keys:

- Private key retrieval
- Key caching
- Environment variable integration

## Database Schema

### `verifiable_credentials`

Stores all issued Verifiable Credentials.

| Column              | Type         | Description                 |
| ------------------- | ------------ | --------------------------- |
| `id`                | SERIAL       | Primary key                 |
| `vc_id`             | VARCHAR(255) | Unique VC identifier (UUID) |
| `did`               | VARCHAR(255) | Subject DID                 |
| `plugin_id`         | VARCHAR(255) | Associated plugin ID        |
| `vc_data`           | JSONB        | VC data structure           |
| `jws`               | TEXT         | JWT string format           |
| `issuer_did`        | VARCHAR(255) | Issuer DID                  |
| `issuance_date`     | TIMESTAMP    | When VC was issued          |
| `expiration_date`   | TIMESTAMP    | When VC expires             |
| `revoked`           | BOOLEAN      | Revocation status           |
| `revoked_at`        | TIMESTAMP    | When VC was revoked         |
| `revocation_reason` | TEXT         | Reason for revocation       |

### `vc_revocation_list`

Tracks revoked VCs for quick revocation checking.

| Column       | Type         | Description          |
| ------------ | ------------ | -------------------- |
| `id`         | SERIAL       | Primary key          |
| `vc_id`      | VARCHAR(255) | VC identifier (FK)   |
| `revoked_at` | TIMESTAMP    | Revocation timestamp |
| `reason`     | TEXT         | Revocation reason    |

### `audit_logs`

Stores audit trail of security events.

| Column       | Type         | Description                                      |
| ------------ | ------------ | ------------------------------------------------ |
| `id`         | SERIAL       | Primary key                                      |
| `event_type` | VARCHAR(100) | Event type (authentication, authorization, etc.) |
| `did`        | VARCHAR(255) | Associated DID                                   |
| `success`    | BOOLEAN      | Success status                                   |
| `reason`     | TEXT         | Failure reason (if applicable)                   |
| `ip_address` | VARCHAR(45)  | Request IP address                               |
| `metadata`   | JSONB        | Additional event metadata                        |
| `created_at` | TIMESTAMP    | Event timestamp                                  |

## Configuration

### Environment Variables

Create a `.env` file in the service root or platform root:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=truganic_security

# Redis
REDIS_URL=redis://localhost:6379

# Core Service Identity
CORE_DID=did:web:truganic.github.io:did-documents:core
CORE_PRIVATE_KEY=your_private_key_hex

# Logging
LOG_LEVEL=info
LOGS_DIR=./logs
```

### Configuration File

The service uses `src/config/index.ts` to load configuration:

- Loads `.env` from project root and service root
- Validates required environment variables
- Provides type-safe configuration object

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Set up database:**

```bash
# Run the schema SQL file
psql -U postgres -d truganic_security -f database/schema.sql
```

3. **Configure environment:**

```bash
# Copy and edit .env file
cp .env.example .env
# Edit .env with your configuration
```

4. **Build the service:**

```bash
npm run build
```

5. **Start the service:**

```bash
# Development
npm run dev

# Production
npm start
```

## Usage

### Development

```bash
# Start with hot reload
npm run dev

# Run specific tests
npm run test:did-resolver
npm run test:vc-issuer
npm run test:vc-verifier
npm run test:authenticator
npm run test:policy
npm run test:audit

# Run all tests
npm run test:all
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## Authentication Flow

1. **Client generates request:**

   - Creates request payload
   - Generates nonce (UUID)
   - Adds timestamp
   - Signs request with private key

2. **Client sends to Gateway:**

   - Gateway forwards to Security Service `/api/auth/authenticate`

3. **Security Service authenticates:**

   - Resolves DID → Gets public key
   - Verifies nonce (not reused)
   - Verifies timestamp (not too old)
   - Verifies signature (cryptographically valid)
   - Retrieves and verifies VC
   - Returns permissions

4. **Gateway authorizes:**
   - Calls `/api/auth/authorize` with action + resource
   - Policy service maps to permission
   - Checks if permission exists in VC
   - Returns authorization decision

## Security Considerations

### Replay Attack Prevention

- Nonces stored in Redis with TTL (5 minutes)
- Each nonce can only be used once
- Timestamp validation (max 5 minutes old)

### Signature Verification

- Cryptographic verification using DID public keys
- Supports ES256K (secp256k1) signatures
- Signature payload includes method, path, body, headers, timestamp, nonce

### VC Security

- JWT signing with ES256K
- Expiration date checking
- Revocation list verification
- Issuer validation

### Audit Trail

- All authentication attempts logged
- All authorization decisions logged
- VC issuance/revocation logged
- IP address tracking
- Database-backed for compliance

## Testing

The service includes comprehensive test files:

- `test/did-resolver.test.ts` - DID resolution tests
- `test/vc-issuer.test.ts` - VC issuance tests
- `test/vc-verifier.test.ts` - VC verification tests
- `test/authenticator.test.ts` - Authentication tests
- `test/policy.test.ts` - Authorization policy tests
- `test/audit.test.ts` - Audit logging tests

Run tests individually:

```bash
npm run test:did-resolver
```

Or run all tests:

```bash
npm run test:all
```

## Project Structure

```
security/
├── database/
│   └── schema.sql              # Database schema
├── src/
│   ├── app.ts                  # Express app setup
│   ├── server.ts               # Server entry point
│   ├── config/
│   │   └── index.ts            # Configuration
│   ├── routes/
│   │   ├── index.ts            # Route entry point
│   │   ├── auth.routes.ts      # Authentication routes
│   │   ├── did.routes.ts       # DID resolution routes
│   │   └── vc.routes.ts        # VC management routes
│   ├── services/
│   │   ├── authenticator.service.ts
│   │   ├── policy.service.ts
│   │   ├── did-resolver.service.ts
│   │   ├── vc-issuer.service.ts
│   │   ├── vc-verifier.service.ts
│   │   ├── audit.service.ts
│   │   └── key-management.service.ts
│   ├── lib/
│   │   ├── cache/              # Redis cache
│   │   ├── crypto/             # Cryptographic utilities
│   │   ├── db/                 # Database connection
│   │   ├── logger/             # Winston logger
│   │   └── vermo/              # Veramo agent setup
│   └── test/                    # Test files
├── logs/                        # Log files
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

### Core Dependencies

- `express` - Web framework
- `@veramo/core` - Veramo DID framework
- `did-jwt` - JWT creation/verification
- `did-resolver` - DID resolution
- `web-did-resolver` - Web DID resolver
- `pg` - PostgreSQL client
- `ioredis` - Redis client
- `winston` - Logging
- `elliptic` - Cryptographic operations

### Development Dependencies

- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `nodemon` - Development server
- `@types/*` - Type definitions

## Automated tests (GitHub Actions)

The **platform-core** repo workflow `.github/workflows/security-hourly.yml` runs `npm run test:ci` in this package **every hour** (UTC) and on pushes that touch `core/security/**`.

**Repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `TRUGANIC_CI_CORE_PRIVATE_KEY` | Issuer key (hex) for `CORE_DID` — must match the public key in the published **core** DID document. |
| `TRUGANIC_CI_CLIENT_PRIVATE_KEY` | Client key (hex) for **ci-automation-client** — must match `did-documents/clients/ci-automation-client/did.json`. |

Postgres and Redis are started as **service containers**; schema is applied from `database/ci-schema.sql`. The workflow runs **`npm run build:shared`** after `npm ci` so **`@shared/types`** has a `dist/` folder (required for `ts-node` imports).

## License

Part of the TruGanic platform.

## Support

For issues and questions, please refer to the main platform documentation or contact the development team.
