# ChainProof API Documentation

## Overview

ChainProof API provides token analysis services for Solana blockchain tokens, offering MEME vs UTILITY classification and risk assessment.

**Base URL:** `http://localhost:3000`

---

## API Tiers

### Public API (Free)
- **Base Path:** `/api/mu-checker`
- **Rate Limit:** 100 requests per 15 minutes per token address
- **Batch Limit:** 20 batch requests per 15 minutes
- **Authentication:** None required
- **Use Case:** Your existing platform users

### Premium API (API Key Required)
- **Base Path:** `/api/v1/mu-checker`
- **Rate Limit:** 500 requests per 15 minutes per API key
- **Batch Limit:** 50 batch requests per 15 minutes
- **Authentication:** API Key via `x-api-key` header
- **Use Case:** Developers integrating ChainProof into their applications

---

## Authentication

### 1. Register Developer Account

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "username": "developer123",
  "email": "dev@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "developer123",
      "email": "dev@example.com",
      "createdAt": "2025-10-23T21:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 2. Login

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "dev@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "developer123",
      "email": "dev@example.com",
      "lastLogin": "2025-10-23T21:05:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 3. Generate API Key

**Endpoint:** `POST /auth/api-keys`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**
```json
{
  "name": "Production API Key",
  "expiresInDays": 365,
  "permissions": {
    "analyze": true,
    "riskScore": true,
    "fullAnalysis": true,
    "batch": true,
    "registration": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key created successfully.",
  "data": {
    "apiKey": "cp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
    "name": "Production API Key",
    "id": "507f1f77bcf86cd799439012",
    "permissions": {
      "analyze": true,
      "riskScore": true,
      "fullAnalysis": true,
      "batch": true,
      "registration": true
    },
    "expiresAt": "2026-10-23T21:10:00.000Z",
    "createdAt": "2025-10-23T21:10:00.000Z"
  },
  "warning": "Please save this API key securely. You will not be able to see it again."
}
```

---

### 4. List API Keys

**Endpoint:** `GET /auth/api-keys`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "name": "Production API Key",
      "keyPreview": "...y5z6",
      "isActive": true,
      "lastUsed": "2025-10-23T21:15:00.000Z",
      "usageCount": 1523,
      "permissions": { ... },
      "expiresAt": "2026-10-23T21:10:00.000Z",
      "createdAt": "2025-10-23T21:10:00.000Z"
    }
  ]
}
```

---

### 5. Revoke API Key

**Endpoint:** `DELETE /auth/api-keys/:keyId`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "message": "API key revoked successfully.",
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Production API Key"
  }
}
```

---

### 6. Update API Key

**Endpoint:** `PATCH /auth/api-keys/:keyId`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**
```json
{
  "name": "Updated Key Name",
  "isActive": false
}
```

---

### 7. Get User Profile

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "developer123",
      "email": "dev@example.com",
      "isActive": true,
      "createdAt": "2025-10-23T21:00:00.000Z",
      "lastLogin": "2025-10-23T21:05:00.000Z"
    },
    "apiKeyCount": 2
  }
}
```

---

## Token Analysis Endpoints

All analysis endpoints are available in both **Public** and **Premium** tiers.

### 1. Analyze Token Classification

**Public:** `POST /api/mu-checker/analyze`
**Premium:** `POST /api/v1/mu-checker/analyze`

**Headers (Premium only):**
```
x-api-key: cp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Request Body:**
```json
{
  "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "UTILITY",
    "utilityScore": 85,
    "memeScore": 15,
    "analysis": {
      "verification": { ... },
      "marketPresence": { ... },
      "tradingPatterns": { ... }
    }
  },
  "apiKeyUsed": "Production API Key",
  "rateLimitInfo": {
    "tier": "premium",
    "limit": "500 requests per 15 minutes"
  }
}
```

---

### 2. Calculate Risk Score

**Public:** `POST /api/mu-checker/risk-score`
**Premium:** `POST /api/v1/mu-checker/risk-score`

**Request Body:**
```json
{
  "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "riskLevel": "SAFE",
    "riskScore": 25,
    "recommendation": "Token shows strong fundamentals...",
    "detailedScores": {
      "volumeScore": 10,
      "holderScore": 5,
      "liquidityScore": 2,
      "ageScore": 3,
      "verificationScore": 0,
      "marketCapScore": 5
    }
  }
}
```

**Risk Levels:**
- `SAFE`: Score 0-40
- `MODERATE`: Score 41-65
- `DANGER`: Score 66-100

---

### 3. Full Token Analysis

**Public:** `POST /api/mu-checker/full-analysis`
**Premium:** `POST /api/v1/mu-checker/full-analysis`

**Request Body:**
```json
{
  "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Response:**
```json
{
  "success": true,
  "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "classification": {
    "type": "UTILITY",
    "utilityScore": 85,
    "memeScore": 15,
    "analysis": { ... }
  },
  "riskAssessment": {
    "riskLevel": "SAFE",
    "riskScore": 25,
    "recommendation": "...",
    "detailedScores": { ... }
  },
  "tokenInfo": {
    "name": "USD Coin",
    "symbol": "USDC",
    "logoURI": "https://...",
    "verified": true
  },
  "jupiterData": { ... },
  "timestamp": "2025-10-23T21:20:00.000Z"
}
```

---

### 4. Batch Classification

**Public:** `POST /api/mu-checker/batch-classify`
**Premium:** `POST /api/v1/mu-checker/batch-classify`

**Request Body:**
```json
{
  "tokenAddresses": [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "So11111111111111111111111111111111111111112"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "results": [
    {
      "success": true,
      "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "data": {
        "type": "UTILITY",
        "utilityScore": 85,
        "memeScore": 15
      }
    },
    {
      "success": true,
      "tokenAddress": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      "data": { ... }
    },
    {
      "success": false,
      "tokenAddress": "So11111111111111111111111111111111111111112",
      "error": "Token not found"
    }
  ]
}
```

**Limits:**
- Maximum 10 tokens per batch request

---

### 5. Batch Risk Scoring

**Public:** `POST /api/mu-checker/batch-risk`
**Premium:** `POST /api/v1/mu-checker/batch-risk`

**Request Body:**
```json
{
  "tokenAddresses": [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
  ]
}
```

---

### 6. Batch Full Analysis (Premium Only)

**Endpoint:** `POST /api/v1/mu-checker/batch-full-analysis`

**Headers:**
```
x-api-key: cp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Request Body:**
```json
{
  "tokenAddresses": [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "results": [
    {
      "success": true,
      "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "data": {
        "classification": { ... },
        "riskAssessment": { ... },
        "tokenInfo": { ... },
        "jupiterData": { ... }
      }
    }
  ],
  "timestamp": "2025-10-23T21:25:00.000Z"
}
```

---

### 7. Prepare Token Registration

**Public:** `POST /api/mu-checker/prepare-registration`
**Premium:** `POST /api/v1/mu-checker/prepare-registration`

**Request Body:**
```json
{
  "mintAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "projectName": "USD Coin",
  "socials": {
    "website": "https://www.circle.com/usdc",
    "twitter": "https://twitter.com/circle",
    "discord": "https://discord.gg/circle"
  }
}
```

---

## Error Responses

### Authentication Errors

**401 Unauthorized - Missing API Key:**
```json
{
  "success": false,
  "error": "API key is required. Please provide your API key in the x-api-key header."
}
```

**401 Unauthorized - Invalid API Key:**
```json
{
  "success": false,
  "error": "Invalid API key."
}
```

**401 Unauthorized - Expired API Key:**
```json
{
  "success": false,
  "error": "API key has expired."
}
```

**403 Forbidden - Missing Permission:**
```json
{
  "success": false,
  "error": "This API key does not have permission for: batch"
}
```

### Rate Limit Errors

**429 Too Many Requests - Public:**
```json
{
  "success": false,
  "error": "Too many requests for this token, please try again later."
}
```

**429 Too Many Requests - Premium:**
```json
{
  "success": false,
  "error": "Premium rate limit exceeded (500 requests per 15 minutes). Please wait before retrying."
}
```

### Validation Errors

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Token address is required"
}
```

---

## Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "uptime": 3600.123,
  "timestamp": "2025-10-23T21:30:00.000Z",
  "memory": {
    "used": "150 MB",
    "total": "512 MB"
  }
}
```

---

## Rate Limiting Summary

| Tier | Endpoint Type | Limit | Window | Key |
|------|--------------|-------|--------|-----|
| Public | Standard | 100 req | 15 min | Token Address |
| Public | Batch | 20 req | 15 min | First Token in Batch |
| Premium | Standard | 500 req | 15 min | API Key |
| Premium | Batch | 50 req | 15 min | API Key |

---

## Example Integration

### JavaScript/Node.js

```javascript
// Register and get API key
const register = await fetch('http://localhost:3000/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'myapp',
    email: 'dev@myapp.com',
    password: 'SecurePass123!'
  })
});

const { data } = await register.json();
const jwtToken = data.token;

// Generate API key
const apiKeyResponse = await fetch('http://localhost:3000/auth/api-keys', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    name: 'My App Production Key',
    expiresInDays: 365
  })
});

const { data: keyData } = await apiKeyResponse.json();
const apiKey = keyData.apiKey;

// Use API key to analyze token
const analysis = await fetch('http://localhost:3000/api/v1/mu-checker/full-analysis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  },
  body: JSON.stringify({
    tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  })
});

const result = await analysis.json();
console.log(result);
```

---

## MongoDB Connection Issue

**Current Status:** MongoDB connection is timing out. The server will continue to run, but authentication endpoints will not work until MongoDB is connected.

**To Fix:**
1. Check MongoDB Atlas network access and add your IP to the whitelist
2. Verify the MongoDB URI is correct
3. Ensure the database user has proper permissions

Once MongoDB is connected, you'll see:
```
✅ MongoDB Connected: cluster0.kxbcn0z.mongodb.net
📊 Database: chainproof_dev
```

---

## Support

For issues or questions, please contact the development team.
