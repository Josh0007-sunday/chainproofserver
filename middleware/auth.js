import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import APIKey from '../models/APIKey.js';

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
