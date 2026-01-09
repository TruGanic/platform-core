# API Gateway Service

A Zero-Trust API Gateway service for the TruGanic platform, implementing DID-based authentication and authorization with cryptographic signature verification. This gateway serves as the entry point for all API requests, enforcing security policies and routing authenticated requests to appropriate services.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Authentication Flow](#authentication-flow)
- [Authorization Flow](#authorization-flow)
- [API Endpoints](#api-endpoints)
- [Middleware](#middleware)
- [Caching](#caching)
- [Logging](#logging)
- [Project Structure](#project-structure)
- [Development](#development)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

The API Gateway is a critical component of the TruGanic platform that implements Zero-Trust security principles. It:

- **Authenticates** all incoming requests using DID-based cryptographic signatures
- **Authorizes** requests based on Verifiable Credentials (VCs) and permissions
- **Caches** authorization results for performance optimization
- **Routes** authenticated requests to appropriate backend services
- **Logs** all security events and request flows

The gateway integrates with a Security Service for authentication and authorization decisions, and uses Redis for caching authorization results to improve performance.

## Features

- ✅ **Zero-Trust Authentication**: DID-based authentication with cryptographic signature verification
- ✅ **Permission-Based Authorization**: Fine-grained access control using Verifiable Credentials
- ✅ **Redis Caching**: Authorization result caching for improved performance
- ✅ **Security Service Integration**: Delegates authentication/authorization to dedicated security service
- ✅ **Comprehensive Logging**: Winston-based logging with file and console transports
- ✅ **Health Checks**: Built-in health check endpoint for monitoring
- ✅ **Graceful Shutdown**: Proper cleanup of connections on shutdown
- ✅ **Development Mode**: Optional authentication bypass for development
- ✅ **TypeScript**: Full TypeScript support with type safety

## Architecture

### Request Flow

```
Client Request
    ↓
[Express App]
    ↓
[Auth Middleware] → Security Service (/api/auth/authenticate)
    ↓ (if authenticated)
[Authorize Middleware] → Security Service (/api/auth/authorize)
    ↓ (if authorized)
[Route Handler]
    ↓
Response
```

### Components

1. **Authentication Middleware** (`auth.middleware.ts`)
   - Extracts DID and signature from headers
   - Validates required headers
   - Calls Security Service for authentication
   - Attaches DID and permissions to request

2. **Authorization Middleware** (`authorize.middleware.ts`)
   - Checks Redis cache first
   - Calls Security Service if cache miss
   - Caches authorization results
   - Enforces permission-based access control

3. **Security Client Service** (`security-client.service.ts`)
   - HTTP client for Security Service
   - Handles authentication requests
   - Handles authorization requests
   - Error handling and retries

4. **Redis Cache** (`lib/cache/redis.ts`)
   - Authorization result caching
   - Cache invalidation support
   - Connection management

5. **Logger** (`lib/logger/index.ts`)
   - Winston-based logging
   - File and console transports
   - Structured logging with metadata

## Prerequisites

- **Node.js** (v16 or higher recommended)
- **npm** (v7 or higher) or **yarn**
- **Redis** server (for caching)
- **Security Service** (must be running and accessible)
- **TypeScript** (installed as dev dependency)

## Installation

1. **Navigate to the gateway directory**:
   ```bash
   cd platform-core/core/gateway
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project** (optional, for production):
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

Create a `.env` file in the project root or platform root with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Security Service Configuration
SECURITY_SERVICE_URL=http://localhost:3001

# Authentication Configuration
AUTH_REQUIRED=true  # Set to "false" to bypass auth in development

# Authorization Cache Configuration
AUTHZ_CACHE_ENABLED=true  # Enable/disable authorization caching
AUTHZ_CACHE_TTL=300  # Cache TTL in seconds (default: 5 minutes)

# Logging Configuration
LOG_LEVEL=info  # debug, info, warn, error
LOGS_DIR=./logs  # Directory for log files
```

### Configuration Priority

The gateway loads environment variables in the following order:

1. Project root `.env` file
2. Service directory `.env` file
3. System environment variables

### Required Variables

- `REDIS_URL`: Redis connection string (required)
- `SECURITY_SERVICE_URL`: URL of the Security Service (default: `http://localhost:3001`)

### Optional Variables

- `PORT`: Server port (default: `3000`)
- `AUTH_REQUIRED`: Enable/disable authentication (default: `true`)
- `AUTHZ_CACHE_ENABLED`: Enable/disable authorization caching (default: `true`)
- `AUTHZ_CACHE_TTL`: Cache TTL in seconds (default: `300`)

## Usage

### Development Mode

Run the gateway in development mode with hot-reloading:

```bash
npm run dev
```

### Production Mode

Build and run the compiled JavaScript:

```bash
npm run build
npm start
```

### Health Check

Check if the gateway is running:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "service": "Gateway Service",
  "status": "active",
  "env": "development",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "securityServiceUrl": "http://localhost:3001"
}
```

## Authentication Flow

### Required Headers

All authenticated requests must include:

- **`x-plugin-did`**: The DID of the client/plugin making the request
- **`x-signature`**: Base64-encoded cryptographic signature
- **`x-timestamp`**: ISO 8601 timestamp of the request
- **`x-nonce`**: Random nonce for replay attack prevention

### Authentication Process

1. **Extract Headers**: Gateway extracts DID, signature, timestamp, and nonce
2. **Validate Headers**: Ensures all required headers are present
3. **Call Security Service**: Sends authentication request to Security Service
4. **Verify Signature**: Security Service verifies the cryptographic signature
5. **Resolve DID**: Security Service resolves DID document and extracts public key
6. **Check Nonce**: Security Service validates nonce (prevents replay attacks)
7. **Check Timestamp**: Security Service validates timestamp (prevents expired requests)
8. **Return Permissions**: Security Service returns permissions from Verifiable Credentials

### Example Request

```bash
curl -X GET http://localhost:3000/api/data \
  -H "x-plugin-did: did:web:truganic.github.io:did-documents:clients:demo-client-1" \
  -H "x-signature: <base64_signature>" \
  -H "x-timestamp: 2024-01-01T00:00:00.000Z" \
  -H "x-nonce: <random_nonce>" \
  -H "Content-Type: application/json"
```

## Authorization Flow

### Authorization Process

1. **Extract DID**: Gets authenticated DID from request (set by auth middleware)
2. **Create Authz Request**: Builds authorization request from HTTP method and path
3. **Check Cache**: Checks Redis cache for previous authorization result
4. **Cache Hit**: Returns cached result if available
5. **Cache Miss**: Calls Security Service for authorization decision
6. **Cache Result**: Stores authorization result in Redis (both allowed and denied)
7. **Enforce Decision**: Allows or denies request based on authorization result

### Permission Model

The gateway uses a permission-based access control model:

- **Permissions** are extracted from Verifiable Credentials
- **Actions** map to HTTP methods (GET, POST, PUT, DELETE, PATCH)
- **Resources** map to API paths (e.g., `/api/data`)
- **Authorization** checks if DID has required permission for action/resource

### Example Permissions

- `read:data` - Permission to read data (GET requests)
- `write:data` - Permission to write data (POST/PUT requests)
- `delete:data` - Permission to delete data (DELETE requests)

## API Endpoints

### Public Endpoints

#### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "service": "Gateway Service",
  "status": "active",
  "env": "development",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "securityServiceUrl": "http://localhost:3001"
}
```

### Protected Endpoints

All endpoints under `/api` require authentication and authorization.

#### `GET /api/data`

Retrieve data (requires `read:data` permission).

**Headers Required:**
- `x-plugin-did`
- `x-signature`
- `x-timestamp`
- `x-nonce`

**Response:**
```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {
    "message": "Hello from Gateway!",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "user": {
      "did": "did:web:truganic.github.io:did-documents:clients:demo-client-1",
      "permissions": ["read:data"]
    }
  }
}
```

#### `POST /api/data`

Create/update data (requires `write:data` permission).

**Headers Required:**
- `x-plugin-did`
- `x-signature`
- `x-timestamp`
- `x-nonce`

**Request Body:**
```json
{
  "message": "Hello from client!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Data saved successfully",
  "data": {
    "received": {
      "message": "Hello from client!",
      "timestamp": "2024-01-01T00:00:00.000Z"
    },
    "timestamp": "2024-01-01T00:00:00.000Z",
    "user": {
      "did": "did:web:truganic.github.io:did-documents:clients:demo-client-1",
      "permissions": ["read:data", "write:data"]
    }
  }
}
```

## Middleware

### Authentication Middleware

**File:** `src/middleware/auth.middleware.ts`

Validates DID-based authentication for all requests.

**Features:**
- Extracts and validates required headers
- Calls Security Service for authentication
- Attaches DID and permissions to request object
- Supports development mode bypass (when `AUTH_REQUIRED=false`)

**Usage:**
```typescript
import { authMiddleware } from "@/middleware";

router.get("/api/data", authMiddleware, handler);
```

### Authorization Middleware

**File:** `src/middleware/authorize.middleware.ts`

Enforces permission-based access control.

**Features:**
- Redis caching for authorization results
- Cache invalidation support
- Calls Security Service for authorization decisions
- Supports cache TTL configuration

**Usage:**
```typescript
import { authorizeMiddleware } from "@/middleware";

router.get("/api/data", authMiddleware, authorizeMiddleware(), handler);
```

**Note:** Authorization middleware must be used **after** authentication middleware.

## Caching

### Authorization Cache

The gateway caches authorization results in Redis to improve performance:

- **Cache Key Format**: `authz:<hash>` (SHA-256 hash of DID, action, resource)
- **Cache TTL**: Configurable via `AUTHZ_CACHE_TTL` (default: 5 minutes)
- **Cache Scope**: Both authorized and denied results are cached
- **Cache Invalidation**: Supports invalidation by DID

### Cache Configuration

```env
AUTHZ_CACHE_ENABLED=true  # Enable/disable caching
AUTHZ_CACHE_TTL=300  # TTL in seconds
```

### Cache Invalidation

Invalidate all cached authorization results for a DID:

```typescript
import { invalidateAuthzCache } from "@/middleware/authorize.middleware";

await invalidateAuthzCache("did:web:example.com:client:1");
```

## Logging

### Log Levels

- **debug**: Detailed debugging information
- **info**: General informational messages
- **warn**: Warning messages
- **error**: Error messages

### Log Files

Logs are written to the `logs/` directory:

- **`combined.log`**: All logs
- **`error.log`**: Error logs only

### Log Format

Logs are in JSON format with the following structure:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "message": "Authentication successful",
  "service": "gateway-service",
  "did": "did:web:example.com:client:1",
  "path": "/api/data"
}
```

### Console Logging

In development mode, logs are also output to the console with colorized formatting.

## Project Structure

```
gateway/
├── src/
│   ├── app.ts                    # Express app setup
│   ├── server.ts                 # Server entry point
│   ├── config/
│   │   └── index.ts             # Configuration management
│   ├── middleware/
│   │   ├── auth.middleware.ts   # Authentication middleware
│   │   ├── authorize.middleware.ts  # Authorization middleware
│   │   └── index.ts             # Middleware exports
│   ├── routes/
│   │   ├── api.routes.ts        # API route handlers
│   │   └── index.ts             # Route setup
│   ├── services/
│   │   └── security-client.service.ts  # Security Service client
│   └── lib/
│       ├── cache/
│       │   ├── index.ts         # Cache exports
│       │   └── redis.ts         # Redis client
│       └── logger/
│           └── index.ts          # Winston logger
├── logs/                         # Log files directory
├── dist/                          # Compiled JavaScript
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## Development

### Running in Development

```bash
npm run dev
```

This starts the server with:
- Hot-reloading via nodemon
- TypeScript compilation via ts-node
- Console logging enabled

### Building for Production

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Running Tests

```bash
npm test
```

### Adding New Routes

1. **Create route handler** in `src/routes/api.routes.ts`:

```typescript
router.get(
  "/new-endpoint",
  authMiddleware,
  authorizeMiddleware(),
  async (req: Request, res: Response) => {
    // Handler logic
  }
);
```

2. **Register route** in `src/routes/index.ts` (if needed)

### Adding New Middleware

1. **Create middleware** in `src/middleware/`
2. **Export** from `src/middleware/index.ts`
3. **Use** in routes

## Security Considerations

### Zero-Trust Principles

- **Never Trust, Always Verify**: Every request is authenticated and authorized
- **Least Privilege**: Permissions are checked for each action/resource
- **Cryptographic Verification**: All requests are cryptographically signed
- **Replay Attack Prevention**: Nonce-based protection against replay attacks
- **Timestamp Validation**: Requests expire after a certain time

### Security Best Practices

1. **Use HTTPS** in production (required for `did:web` resolution)
2. **Keep dependencies updated** for security patches
3. **Monitor logs** for suspicious activity
4. **Rotate keys** periodically
5. **Use strong cryptographic algorithms** (secp256k1)
6. **Implement rate limiting** (consider adding)
7. **Validate all inputs** in route handlers
8. **Use environment variables** for sensitive configuration

### Development Mode

⚠️ **Warning**: Setting `AUTH_REQUIRED=false` disables authentication in development mode. **Never use this in production!**

## Troubleshooting

### Common Issues

#### "REDIS_URL is missing in .env"

**Solution**: Ensure `REDIS_URL` is set in your `.env` file.

#### "Security service is unavailable"

**Possible causes:**
- Security Service is not running
- `SECURITY_SERVICE_URL` is incorrect
- Network connectivity issues

**Solution:**
- Verify Security Service is running
- Check `SECURITY_SERVICE_URL` configuration
- Test connectivity to Security Service

#### "Authentication failed: missing required headers"

**Solution**: Ensure all required headers are present:
- `x-plugin-did`
- `x-signature`
- `x-timestamp`
- `x-nonce`

#### "Authorization denied: Insufficient permissions"

**Possible causes:**
- DID doesn't have required permission
- Verifiable Credential doesn't include permission
- Permission format doesn't match

**Solution:**
- Check Verifiable Credentials for the DID
- Verify permission format matches expected format
- Check Security Service logs for details

#### Redis Connection Issues

**Solution:**
- Verify Redis is running
- Check `REDIS_URL` format
- Test Redis connection: `redis-cli -u <REDIS_URL> ping`

### Debugging

Enable debug logging:

```env
LOG_LEVEL=debug
```

Check logs in `logs/combined.log` and `logs/error.log`.

## Contributing

When contributing to this project:

1. **Follow TypeScript best practices**
2. **Write tests** for new features
3. **Update this README** for new functionality
4. **Follow existing code style**
5. **Add logging** for important operations
6. **Handle errors gracefully**

### Development Workflow

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Build the project: `npm run build`
5. Test locally: `npm run dev`
6. Submit a pull request

## Dependencies

### Production Dependencies

- **express** (^4.18.2): Web framework
- **axios** (^1.6.0): HTTP client for Security Service
- **ioredis** (^5.8.2): Redis client
- **winston** (^3.11.0): Logging library
- **cors** (^2.8.5): CORS middleware
- **dotenv** (^16.6.1): Environment variable management
- **helmet** (^7.1.0): Security headers middleware
- **http-proxy-middleware** (^2.0.6): HTTP proxy middleware
- **opossum** (^8.1.9): Circuit breaker library
- **prom-client** (^15.0.0): Prometheus metrics client
- **@shared/types**: Shared TypeScript types

### Development Dependencies

- **@types/express** (^4.17.21): TypeScript types for Express
- **@types/cors** (^2.8.17): TypeScript types for CORS
- **@types/ioredis** (^4.28.10): TypeScript types for ioredis
- **@types/node** (^20.0.0): TypeScript types for Node.js
- **nodemon** (^3.0.2): Development server with hot-reloading
- **ts-node** (^10.9.2): TypeScript execution environment
- **tsconfig-paths** (^4.2.0): TypeScript path mapping
- **typescript** (^5.3.3): TypeScript compiler

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot-reloading |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled JavaScript |
| `npm test` | Run tests |

## Related Documentation

- [Demo Client App](../demo-client-app-1/README.md): Client application for testing
- [TruGanic DID Documents](../../did-documents/README.md): DID documents documentation
- [Security Service](../security/README.md): Security Service documentation (if available)

## License

[Specify your license here]

## Contact

For questions or issues related to the Gateway service, please create an issue or contact the TruGanic development team.
