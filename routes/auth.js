import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import APIKey from '../models/APIKey.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d' // Token expires in 7 days
  });
};

// @route   POST /auth/register
// @desc    Register a new developer account
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide username, email, and password.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({
        success: false,
        error: `${field} is already registered.`
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password
    });

    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during registration. Please try again.'
    });
  }
});

// @route   POST /auth/login
// @desc    Login and get JWT token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password.'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is disabled. Please contact support.'
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          lastLogin: user.lastLogin
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login. Please try again.'
    });
  }
});

// @route   POST /auth/api-keys
// @desc    Generate a new API key
// @access  Private (requires JWT token)
router.post('/api-keys', verifyToken, async (req, res) => {
  try {
    const { name, permissions, expiresInDays } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a name for the API key.'
      });
    }

    // Check how many active keys the user has
    const activeKeysCount = await APIKey.countDocuments({
      userId: req.user._id,
      isActive: true
    });

    if (activeKeysCount >= 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum limit of 10 active API keys reached. Please revoke unused keys.'
      });
    }

    // Generate unique API key
    const key = APIKey.generateKey();

    // Calculate expiration date if provided
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Create API key document
    const apiKey = new APIKey({
      key,
      userId: req.user._id,
      name,
      permissions: permissions || {}, // Use provided permissions or defaults
      expiresAt
    });

    await apiKey.save();

    res.status(201).json({
      success: true,
      message: 'API key created successfully.',
      data: {
        apiKey: key, // Return the full key only once
        name: apiKey.name,
        id: apiKey._id,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      },
      warning: 'Please save this API key securely. You will not be able to see it again.'
    });
  } catch (error) {
    console.error('API key generation error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during API key generation.'
    });
  }
});

// @route   GET /auth/api-keys
// @desc    List all API keys for the authenticated user
// @access  Private (requires JWT token)
router.get('/api-keys', verifyToken, async (req, res) => {
  try {
    const apiKeys = await APIKey.find({ userId: req.user._id })
      .select('-key') // Don't return the actual keys
      .sort({ createdAt: -1 });

    // Transform _id to id for frontend compatibility
    const transformedKeys = apiKeys.map(key => ({
      id: key._id,
      userId: key.userId,
      name: key.name,
      isActive: key.isActive,
      lastUsed: key.lastUsed,
      usageCount: key.usageCount,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt
    }));

    res.json({
      success: true,
      count: transformedKeys.length,
      data: transformedKeys
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching API keys.'
    });
  }
});

// @route   DELETE /auth/api-keys/:keyId
// @desc    Revoke/delete an API key
// @access  Private (requires JWT token)
router.delete('/api-keys/:keyId', verifyToken, async (req, res) => {
  try {
    const { keyId } = req.params;

    // Find the API key
    const apiKey = await APIKey.findOne({
      _id: keyId,
      userId: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found.'
      });
    }

    // Delete the API key
    await APIKey.deleteOne({ _id: keyId });

    res.json({
      success: true,
      message: 'API key revoked successfully.',
      data: {
        id: apiKey._id,
        name: apiKey.name
      }
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while revoking API key.'
    });
  }
});

// @route   PATCH /auth/api-keys/:keyId
// @desc    Update API key (name or active status)
// @access  Private (requires JWT token)
router.patch('/api-keys/:keyId', verifyToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { name, isActive } = req.body;

    // Find the API key
    const apiKey = await APIKey.findOne({
      _id: keyId,
      userId: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found.'
      });
    }

    // Update fields
    if (name !== undefined) apiKey.name = name;
    if (isActive !== undefined) apiKey.isActive = isActive;

    await apiKey.save();

    res.json({
      success: true,
      message: 'API key updated successfully.',
      data: apiKey
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating API key.'
    });
  }
});

// @route   GET /auth/me
// @desc    Get current user profile
// @access  Private (requires JWT token)
router.get('/me', verifyToken, async (req, res) => {
  try {
    // Count user's API keys
    const apiKeyCount = await APIKey.countDocuments({
      userId: req.user._id,
      isActive: true
    });

    res.json({
      success: true,
      data: {
        user: req.user,
        apiKeyCount
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching profile.'
    });
  }
});

export default router;
