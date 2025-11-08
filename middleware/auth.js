import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import APIKey from '../models/APIKey.js';
import paymentController from '../controllers/paymentController.js';

// Middleware to verify JWT token (for authenticated routes like generating API keys)
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token or user account is disabled.'
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token.'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during authentication.'
    });
  }
};

// Middleware to verify API key (for public API endpoints)
export const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required. Please provide your API key in the x-api-key header.'
      });
    }

    // Find the API key in database
    const keyDoc = await APIKey.findOne({ key: apiKey }).populate('userId', 'username email isActive');

    if (!keyDoc) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key.'
      });
    }

    // Check if key is active
    if (!keyDoc.isActive) {
      return res.status(401).json({
        success: false,
        error: 'API key has been revoked.'
      });
    }

    // Check if key is expired
    if (keyDoc.isExpired()) {
      return res.status(401).json({
        success: false,
        error: 'API key has expired.'
      });
    }

    // Check if subscription payment is current
    if (!keyDoc.isSubscriptionCurrent()) {
      return res.status(402).json({
        success: false,
        error: 'API key subscription has expired. Please renew your subscription.',
        subscriptionExpired: true,
        paidUntil: keyDoc.paidUntil,
        subscriptionAmount: keyDoc.subscriptionAmount
      });
    }

    // Check if user account is active
    if (!keyDoc.userId.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User account is disabled.'
      });
    }

    // Record usage (non-blocking)
    keyDoc.recordUsage().catch(err => {
      console.error('Error recording API key usage:', err);
    });

    // Attach API key and user info to request
    req.apiKey = keyDoc;
    req.user = keyDoc.userId;

    next();
  } catch (error) {
    console.error('API key verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during API key verification.'
    });
  }
};

// Middleware to check specific permissions
export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey || !req.apiKey.permissions[permission]) {
      return res.status(403).json({
        success: false,
        error: `This API key does not have permission for: ${permission}`
      });
    }
    next();
  };
};

// Middleware to verify x402 payment
export const verifyX402Payment = async (req, res, next) => {
  try {
    // Check if x402 is enabled
    const x402Enabled = process.env.X402_ENABLED === 'true';

    if (!x402Enabled) {
      // x402 not enabled, skip payment verification
      return next();
    }

    // Check for X-PAYMENT header
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // No payment provided, return 402 Payment Required
      const paymentRequirements = paymentController.getPaymentRequirements();

      return res.status(402).json({
        success: false,
        error: 'Payment required',
        paymentRequired: true,
        x402: {
          version: 1,
          recipient: paymentRequirements.recipient,
          amount: paymentRequirements.amount,
          token: paymentRequirements.token,
          network: paymentRequirements.network,
          message: 'This endpoint requires payment. Please include a valid payment transaction in the X-PAYMENT header.'
        }
      });
    }

    // Parse payment header
    let paymentData;
    try {
      paymentData = JSON.parse(paymentHeader);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid X-PAYMENT header format. Expected JSON.'
      });
    }

    // Validate payment data structure
    if (!paymentData.x402Version || !paymentData.scheme || !paymentData.network || !paymentData.payload) {
      return res.status(400).json({
        success: false,
        error: 'Invalid x402 payment structure. Missing required fields.'
      });
    }

    if (!paymentData.payload.serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serialized transaction in payment payload.'
      });
    }

    // Verify the payment
    const endpoint = req.originalUrl || req.url;
    const userId = req.user?._id || null;

    const verificationResult = await paymentController.verifyPayment(
      paymentData.payload.serializedTransaction,
      endpoint,
      userId
    );

    if (!verificationResult.success) {
      return res.status(402).json({
        success: false,
        error: 'Payment verification failed',
        details: verificationResult.error,
        paymentRequired: true
      });
    }

    // Attach payment info to request
    req.payment = verificationResult.payment;

    next();
  } catch (error) {
    console.error('x402 payment verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during payment verification.'
    });
  }
};

// Optional: Middleware that allows either API key OR x402 payment
export const verifyApiKeyOrPayment = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  // If API key is provided, use standard API key verification
  if (apiKey) {
    return verifyApiKey(req, res, next);
  }

  // Otherwise, require x402 payment
  return verifyX402Payment(req, res, next);
};
