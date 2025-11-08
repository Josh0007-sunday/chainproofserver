import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/mongodb.js';
import muCheckerRoutes from './routes/mutChecker.js';
import premiumMuCheckerRoutes from './routes/premiumMutChecker.js';
import authRoutes from './routes/auth.js';
import chainproofRoutes from './routes/chainproof.js';

// Import models to ensure they're registered with Mongoose
import './models/User.js';
import './models/APIKey.js';

console.log('✅ Imports successful');
console.log('🔑 Environment check - PINATA_JWT:', process.env.PINATA_JWT ? 'Loaded ✓' : 'Missing ✗');
console.log('🔑 Environment check - JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded ✓' : 'Missing ✗');
console.log('🔑 Environment check - MONGODB_URI:', process.env.MONGODB_URI ? 'Loaded ✓' : 'Missing ✗');

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Trust proxy - REQUIRED for deployment on Render, Heroku, Vercel, etc.
// This allows Express to trust the X-Forwarded-For header from the proxy
app.set('trust proxy', 1);

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting configuration for PUBLIC endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests for this token, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => false,
  keyGenerator: (req) => {
    // Use token address as key for rate limiting instead of IP
    const tokenAddress = req.body?.tokenAddress || req.body?.mintAddress;
    if (tokenAddress) return tokenAddress;
    // Fallback to timestamp-based key instead of IP to avoid IPv6 validation issues
    return `anon-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
});

const batchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many batch requests, please try again later.'
  },
  keyGenerator: (req) => {
    // Use first token address in batch as key
    const tokenAddresses = req.body?.tokenAddresses;
    if (tokenAddresses && Array.isArray(tokenAddresses) && tokenAddresses.length > 0) {
      return tokenAddresses[0];
    }
    return `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
});

// Rate limiting configuration for PREMIUM endpoints (API key required)
const premiumLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    error: 'Premium rate limit exceeded (500 requests per 15 minutes). Please wait before retrying.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use API key for rate limiting
    return req.apiKey?._id?.toString() || `premium-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
});

const premiumBatchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: 'Premium batch rate limit exceeded (50 batch requests per 15 minutes). Please wait before retrying.'
  },
  keyGenerator: (req) => {
    // Use API key for rate limiting
    return req.apiKey?._id?.toString() || `premium-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ChainProof API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      publicAPI: '/api/mu-checker (free, rate limited)',
      premiumAPI: '/api/v1/mu-checker (requires API key, higher limits)',
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Apply rate limiting to PUBLIC API routes
app.use('/api/', limiter);

// Apply stricter rate limiting to PUBLIC batch endpoints (must be before the route definitions)
app.use('/api/mu-checker/batch-risk', batchLimiter);
app.use('/api/mu-checker/batch-classify', batchLimiter);

// Apply rate limiting to PREMIUM API routes
app.use('/api/v1/', premiumLimiter);

// Apply stricter rate limiting to PREMIUM batch endpoints (must be before the route definitions)
app.use('/api/v1/mu-checker/batch-risk', premiumBatchLimiter);
app.use('/api/v1/mu-checker/batch-classify', premiumBatchLimiter);
app.use('/api/v1/mu-checker/batch-full-analysis', premiumBatchLimiter);

// Use routes
app.use('/auth', authRoutes);
app.use('/api/mu-checker', muCheckerRoutes);
app.use('/api/v1/mu-checker', premiumMuCheckerRoutes);
app.use('/api/chainproof', chainproofRoutes);

// Global health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: {
      general: [
        'GET /',
        'GET /health'
      ],
      authentication: [
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/api-keys (JWT required)',
        'GET /auth/api-keys (JWT required)',
        'DELETE /auth/api-keys/:keyId (JWT required)',
        'PATCH /auth/api-keys/:keyId (JWT required)',
        'GET /auth/me (JWT required)'
      ],
      publicAPI: [
        'POST /api/mu-checker/analyze (free)',
        'POST /api/mu-checker/risk-score (free)',
        'POST /api/mu-checker/full-analysis (free)',
        'POST /api/mu-checker/batch-risk (free)',
        'POST /api/mu-checker/batch-classify (free)',
        'POST /api/mu-checker/prepare-registration (free)',
        'GET /api/mu-checker/health'
      ],
      premiumAPI: [
        'POST /api/v1/mu-checker/analyze (API key required)',
        'POST /api/v1/mu-checker/risk-score (API key required)',
        'POST /api/v1/mu-checker/full-analysis (API key required)',
        'POST /api/v1/mu-checker/batch-risk (API key required)',
        'POST /api/v1/mu-checker/batch-classify (API key required)',
        'POST /api/v1/mu-checker/batch-full-analysis (API key required)',
        'POST /api/v1/mu-checker/prepare-registration (API key required)',
        'GET /api/v1/mu-checker/health'
      ]
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Start server (only when not in Vercel serverless environment)
if (process.env.VERCEL !== '1') {
  const server = app.listen(PORT, () => {
    console.log('=================================');
    console.log(`🚀 ChainProof API Server`);
    console.log(`📡 Environment: ${NODE_ENV}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log('=================================');
    console.log('Available endpoints:');
    console.log(`  GET  http://localhost:${PORT}/`);
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log('\n  Authentication:');
    console.log(`  POST http://localhost:${PORT}/auth/register`);
    console.log(`  POST http://localhost:${PORT}/auth/login`);
    console.log(`  POST http://localhost:${PORT}/auth/api-keys (JWT required)`);
    console.log(`  GET  http://localhost:${PORT}/auth/api-keys (JWT required)`);
    console.log('\n  Public API (Free - 100 req/15min):');
    console.log(`  POST http://localhost:${PORT}/api/mu-checker/analyze`);
    console.log(`  POST http://localhost:${PORT}/api/mu-checker/risk-score`);
    console.log(`  POST http://localhost:${PORT}/api/mu-checker/full-analysis`);
    console.log(`  POST http://localhost:${PORT}/api/mu-checker/batch-classify`);
    console.log('\n  Premium API (API Key - 500 req/15min):');
    console.log(`  POST http://localhost:${PORT}/api/v1/mu-checker/analyze`);
    console.log(`  POST http://localhost:${PORT}/api/v1/mu-checker/risk-score`);
    console.log(`  POST http://localhost:${PORT}/api/v1/mu-checker/full-analysis`);
    console.log(`  POST http://localhost:${PORT}/api/v1/mu-checker/batch-full-analysis`);
    console.log('=================================');
  });

  // Graceful shutdown (only for local server)
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Export for Vercel serverless
export default app;