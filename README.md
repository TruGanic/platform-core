# TruGanic Platform Core

A comprehensive microservices platform implementing Zero-Trust security architecture for the TruGanic supply chain ecosystem. This monorepo contains core services for authentication, authorization, service discovery, and lifecycle management using Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs).

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services](#services)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development](#development)
- [Project Structure](#project-structure)
- [Shared Types](#shared-types)
- [Workspace Management](#workspace-management)
- [Docker Deployment](#docker-deployment)
- [Testing](#testing)
- [Security](#security)
- [Contributing](#contributing)

## Overview

The TruGanic Platform Core is a TypeScript-based microservices architecture that provides:

- **Zero-Trust Security**: DID-based authentication and VC-based authorization
- **Service Discovery**: Plugin registry for service registration and discovery
- **Lifecycle Management**: Canary deployments and metrics collection
- **API Gateway**: Centralized entry point with authentication and authorization
- **Security Service**: Comprehensive DID/VC management and verification

### Key Technologies

- **TypeScript**: Type-safe development across all services
- **Express.js**: Web framework for REST APIs
- **PostgreSQL**: Relational database for persistent storage
- **Redis**: Caching and message queuing
- **DID/VC**: Decentralized identity and verifiable credentials
- **npm Workspaces**: Monorepo management

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Applications                      │
└───────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
│  • Authentication Middleware                                │
│  • Authorization Middleware                                 │
│  • Request Routing                                           │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────┴───────┬───────────────┬──────────────┐
        │               │               │              │
        ▼               ▼               ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Security   │ │   Registry   │ │  Lifecycle   │ │   Plugins    │
│   Service    │ │   Service    │ │   Service    │ │              │
│              │ │              │ │              │ │              │
│ • DID Resol. │ │ • Discovery  │ │ • Deploy     │ │ • Business   │
│ • VC Issuance│ │ • Health     │ │ • Metrics    │ │   Logic      │
│ • Auth/Authz │ │ • Tracking   │ │ • Canary     │ │              │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────────────┘
       │                │                 │
       └────────────────┴─────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────┐            ┌──────────────┐
│  PostgreSQL  │            │    Redis     │
│  Database    │            │    Cache     │
└──────────────┘            └──────────────┘
```

### Request Flow

1. **Client Request** → API Gateway
2. **Authentication** → Security Service verifies DID signature
3. **Authorization** → Security Service checks VC permissions
4. **Routing** → Gateway routes to appropriate service
5. **Service Processing** → Business logic execution
6. **Response** → Gateway returns response to client

## Services

### 1. API Gateway (`@core/gateway`)

**Purpose**: Centralized entry point for all API requests

**Features**:

- DID-based authentication middleware
- Permission-based authorization middleware
- Request routing and proxying
- Redis caching for authorization results
- Comprehensive logging

**Port**: `3000` (default)

**Documentation**: [Gateway README](./core/gateway/README.md)

### 2. Security Service (`@core/security`)

**Purpose**: DID/VC authentication, authorization, and credential management

**Features**:

- DID resolution (did:web method)
- Cryptographic signature verification
- Verifiable Credential issuance
- Verifiable Credential verification
- Permission-based authorization policies
- Audit logging

**Port**: `3001` (default)

**Documentation**: [Security Service README](./core/security/README.md)

### 3. Registry Service (`@core/registry`)

**Purpose**: Plugin registry for service discovery and health tracking

**Features**:

- Plugin registration and discovery
- Service health monitoring
- Endpoint management
- Service metadata storage

**Port**: `3002` (default)

### 4. Lifecycle Service (`@core/lifecycle`)

**Purpose**: Lifecycle manager for canary deployments and metrics collection

**Features**:

- Canary deployment management
- Metrics collection and aggregation
- Deployment orchestration
- Health check coordination

**Port**: `3003` (default)

### 5. Shared Types (`@shared/types`)

**Purpose**: Shared TypeScript types and contracts across all services

**Features**:

- Security types (DID, VC, Auth, Authz)
- Plugin types (Registration, Discovery)
- Deployment types (Canary, Metrics)
- Type-safe inter-service communication

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 13 (for Security and Registry services)
- **Redis** >= 6.0 (for caching and message queuing)
- **Docker** (optional, for containerized deployment)
- **Docker Compose** (optional, for local development)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd platform-core
```

### 2. Install Dependencies

Install all workspace dependencies:

```bash
npm install
```

This will install dependencies for:

- Root workspace
- All core services (`@core/*`)
- Shared types (`@shared/types`)

### 3. Build Shared Types

Build the shared types package first (required by other services):

```bash
npm run build:shared
```

### 4. Set Up Databases

#### PostgreSQL

Create databases for Security and Registry services:

```sql
-- Security Service Database
CREATE DATABASE truganic_security;

-- Registry Service Database
CREATE DATABASE truganic_registry;
```

#### Redis

Ensure Redis is running:

```bash
redis-server
```

Or use Docker:

```bash
docker run -d -p 6379:6379 redis:latest
```

### 5. Environment Configuration

Create `.env` files for each service. See [Configuration](#configuration) section for details.

## Configuration

### Root Environment Variables

Create a `.env` file in the root directory:

```env
# Node Environment
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### Service-Specific Configuration

Each service requires its own configuration. See individual service READMEs:

- [Gateway Configuration](./core/gateway/README.md#configuration)
- [Security Service Configuration](./core/security/README.md#configuration)
- Registry Service: See `core/registry/src/config/index.ts`
- Lifecycle Service: See `core/lifecycle/src/config/index.ts`

### Common Environment Variables

Most services use these common variables:

```env
# Server
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/database_name

# Redis
REDIS_URL=redis://localhost:6379

# Security Service URL (for Gateway)
SECURITY_SERVICE_URL=http://localhost:3001
```

## Development

### Running Services Individually

Run a specific service in development mode:

```bash
# Gateway
npm run dev:gateway

# Security Service
npm run dev:security

# Registry Service
npm run dev:registry

# Lifecycle Service
npm run dev:lifecycle
```

### Running All Services

Run all services in parallel:

```bash
npm run dev:all
```

This starts all services simultaneously with hot-reloading.

### Building Services

Build all services:

```bash
npm run build:all
```

Build a specific service:

```bash
npm run build --workspace=@core/gateway
```

### Service Ports

Default ports (configurable via environment variables):

- **Gateway**: `3000`
- **Security**: `3001`
- **Registry**: `3002`
- **Lifecycle**: `3003`

## Project Structure

```
platform-core/
├── core/                          # Core microservices
│   ├── gateway/                  # API Gateway service
│   │   ├── src/
│   │   │   ├── app.ts            # Express app setup
│   │   │   ├── server.ts         # Server entry point
│   │   │   ├── middleware/       # Auth/authz middleware
│   │   │   ├── routes/           # API routes
│   │   │   ├── services/         # Service clients
│   │   │   ├── lib/              # Utilities (cache, logger)
│   │   │   └── config/            # Configuration
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── security/                 # Security service
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── routes/           # Auth, DID, VC routes
│   │   │   ├── services/         # Business logic
│   │   │   ├── lib/              # Crypto, DB, cache, logger
│   │   │   └── config/
│   │   ├── database/             # Database schemas
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── registry/                 # Registry service
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   ├── lib/              # DB, logger
│   │   │   └── config/
│   │   └── package.json
│   │
│   └── lifecycle/                # Lifecycle service
│       ├── src/
│       │   ├── app.ts
│       │   ├── server.ts
│       │   ├── routes/
│       │   ├── lib/              # Cache, logger
│       │   └── config/
│       └── package.json
│
├── shared/                       # Shared code
│   └── types/                    # Shared TypeScript types
│       ├── security.types.ts     # DID, VC, Auth types
│       ├── plugin.types.ts       # Plugin registration types
│       ├── deploy.types.ts       # Deployment types
│       └── index.ts               # Type exports
│
├── infrastructure/               # Infrastructure as Code
│   └── docker-compose.yml        # Docker Compose configuration
│
├── package.json                  # Root workspace configuration
├── tsconfig.json                 # Root TypeScript configuration
└── README.md                     # This file
```

## Shared Types

The `@shared/types` package provides type-safe contracts for inter-service communication.

### Usage

Import types in any service:

```typescript
import {
  AuthenticateRequest,
  AuthenticateResponse,
  AuthorizeRequest,
  AuthorizeResponse,
  VerifiableCredential,
  DIDDocument,
} from "@shared/types";
```

### Type Categories

1. **Security Types** (`security.types.ts`)

   - DID resolution types
   - Verifiable Credential types
   - Authentication/Authorization types

2. **Plugin Types** (`plugin.types.ts`)

   - Plugin registration types
   - Service discovery types

3. **Deployment Types** (`deploy.types.ts`)
   - Canary deployment types
   - Metrics types

## Workspace Management

This project uses npm workspaces for monorepo management.

### Workspace Structure

```json
{
  "workspaces": [
    "core/*", // All services in core/
    "shared" // Shared types package
  ]
}
```

### Adding a New Service

1. Create service directory in `core/`:

   ```bash
   mkdir -p core/new-service/src
   ```

2. Create `package.json`:

   ```json
   {
     "name": "@core/new-service",
     "version": "1.0.0",
     "main": "dist/index.js"
   }
   ```

3. Install dependencies:

   ```bash
   npm install --workspace=@core/new-service <package>
   ```

4. Add dev script to root `package.json`:
   ```json
   {
     "scripts": {
       "dev:new-service": "npm run dev --workspace=@core/new-service"
     }
   }
   ```

### Workspace Scripts

| Script                  | Description                  |
| ----------------------- | ---------------------------- |
| `npm run dev:gateway`   | Run Gateway service          |
| `npm run dev:security`  | Run Security service         |
| `npm run dev:registry`  | Run Registry service         |
| `npm run dev:lifecycle` | Run Lifecycle service        |
| `npm run dev:all`       | Run all services in parallel |
| `npm run build:all`     | Build all services           |
| `npm run build:shared`  | Build shared types           |
| `npm run test:all`      | Run all tests                |

## Docker Deployment

### Docker Compose

Deploy all services using Docker Compose:

```bash
# Build images
npm run docker:build

# Start services
npm run docker:up

# Stop services
npm run docker:down
```

### Individual Service Deployment

Each service can be containerized independently. See service-specific documentation for Dockerfile examples.

## Testing

### Running Tests

Run all tests across workspaces:

```bash
npm run test:all
```

Run tests for a specific service:

```bash
npm run test --workspace=@core/security
```

### Test Structure

Each service includes its own test suite:

- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test service interactions
- **E2E Tests**: Test complete request flows

### Security Service Tests

The Security Service includes comprehensive test suites:

```bash
# DID Resolver tests
npm run test:did-resolver --workspace=@core/security

# VC Issuer tests
npm run test:vc-issuer --workspace=@core/security

# VC Verifier tests
npm run test:vc-verifier --workspace=@core/security

# Authenticator tests
npm run test:authenticator --workspace=@core/security

# Policy tests
npm run test:policy --workspace=@core/security

# All tests
npm run test:all --workspace=@core/security
```

## Security

### Zero-Trust Architecture

The platform implements Zero-Trust security principles:

- **Never Trust, Always Verify**: Every request is authenticated and authorized
- **Least Privilege**: Permissions are checked for each action/resource
- **Cryptographic Verification**: All requests are cryptographically signed
- **Replay Attack Prevention**: Nonce-based protection
- **Timestamp Validation**: Requests expire after a certain time

### Security Features

- **DID-based Authentication**: Decentralized identifier verification
- **VC-based Authorization**: Verifiable Credential permission checking
- **Cryptographic Signatures**: secp256k1 elliptic curve signatures
- **Audit Logging**: Comprehensive security event logging
- **Rate Limiting**: Protection against abuse (in Security Service)

### Security Best Practices

1. **Use HTTPS** in production
2. **Keep dependencies updated** for security patches
3. **Rotate keys** periodically
4. **Monitor logs** for suspicious activity
5. **Use environment variables** for sensitive configuration
6. **Never commit secrets** to version control

## Contributing

### Development Workflow

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/new-feature
   ```

2. **Make changes** in the appropriate service(s)

3. **Build and test**:

   ```bash
   npm run build:all
   npm run test:all
   ```

4. **Run services locally** to verify:

   ```bash
   npm run dev:all
   ```

5. **Commit changes**:

   ```bash
   git commit -m "feat: add new feature"
   ```

6. **Push and create pull request**

### Code Style

- **TypeScript**: Use strict mode, follow existing patterns
- **Naming**: Use descriptive names, follow conventions
- **Documentation**: Add JSDoc comments for public APIs
- **Testing**: Write tests for new features
- **Logging**: Use structured logging with appropriate levels

### Service-Specific Guidelines

- **Gateway**: Focus on routing, middleware, and request handling
- **Security**: Focus on cryptographic operations and VC management
- **Registry**: Focus on service discovery and health tracking
- **Lifecycle**: Focus on deployment orchestration and metrics

## Scripts Reference

### Root Scripts

| Script                  | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev:gateway`   | Run Gateway service in development   |
| `npm run dev:security`  | Run Security service in development  |
| `npm run dev:registry`  | Run Registry service in development  |
| `npm run dev:lifecycle` | Run Lifecycle service in development |
| `npm run dev:all`       | Run all services in parallel         |
| `npm run build:all`     | Build all services                   |
| `npm run build:shared`  | Build shared types package           |
| `npm run test:all`      | Run all tests                        |
| `npm run docker:build`  | Build Docker images                  |
| `npm run docker:up`     | Start Docker containers              |
| `npm run docker:down`   | Stop Docker containers               |

## Dependencies

### Root Dependencies

- **TypeScript** (^5.3.3): TypeScript compiler
- **ts-node** (^10.9.2): TypeScript execution
- **nodemon** (^3.0.2): Development server
- **npm-run-all** (^4.1.5): Run multiple scripts

### Service Dependencies

Each service has its own dependencies. See individual service `package.json` files for details.

## Related Documentation

- [Gateway Service](./core/gateway/README.md)
- [Security Service](./core/security/README.md)
- [DID Documents](../../did-documents/README.md)
- [Demo Client](../../demo-client-app-1/README.md)

## License

[Specify your license here]

## Contact

For questions or issues related to the TruGanic Platform Core, please create an issue or contact the TruGanic development team.
