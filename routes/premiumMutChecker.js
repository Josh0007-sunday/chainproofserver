import express from 'express';
import { MUAlgorithm } from '../MUchecker/algo.js';
import { TokenRiskScorer } from '../MUchecker/riskscore.js';
import { JupiterChecker } from '../controllers/jupiterchecker.js';
import { verifyApiKey, checkPermission } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/v1/mu-checker/analyze
 * @desc    Analyze token classification (MEME vs UTILITY)
 * @access  Private (requires API key with 'analyze' permission)
 */
router.post('/analyze', verifyApiKey, checkPermission('analyze'), async (req, res) => {
  try {
    const { tokenAddress } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address is required'
      });
    }

    const analyzer = new MUAlgorithm();
    const result = await analyzer.analyzeToken(tokenAddress);

    res.json({
      success: true,
      data: result,
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '500 requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Token analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze token'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/risk-score
 * @desc    Calculate token risk score (SAFE, MODERATE, DANGER)
 * @access  Private (requires API key with 'riskScore' permission)
 */
router.post('/risk-score', verifyApiKey, checkPermission('riskScore'), async (req, res) => {
  try {
    const { tokenAddress } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address is required'
      });
    }

    const scorer = new TokenRiskScorer();
    const result = await scorer.assessTokenRisk(tokenAddress);

    res.json({
      success: true,
      data: result,
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '500 requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Risk scoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate risk score'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/full-analysis
 * @desc    Get complete token analysis (classification + risk + Jupiter data)
 * @access  Private (requires API key with 'fullAnalysis' permission)
 */
router.post('/full-analysis', verifyApiKey, checkPermission('fullAnalysis'), async (req, res) => {
  try {
    const { tokenAddress } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address is required'
      });
    }

    // Run classification and risk analysis in parallel
    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();
    const jupiterChecker = new JupiterChecker();

    const [classification, riskAssessment, jupiterData] = await Promise.all([
      analyzer.analyzeToken(tokenAddress),
      scorer.assessTokenRisk(tokenAddress),
      jupiterChecker.searchTokenByAddress(tokenAddress)
    ]);

    res.json({
      success: true,
      tokenAddress,
      classification,
      riskAssessment,
      tokenInfo: jupiterData?.tokenInfo || null,
      jupiterData: jupiterData || null,
      timestamp: new Date().toISOString(),
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '500 requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Full analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform full analysis'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/batch-classify
 * @desc    Classify multiple tokens (max 10)
 * @access  Private (requires API key with 'batch' permission)
 */
router.post('/batch-classify', verifyApiKey, checkPermission('batch'), async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one token address is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens allowed per batch request'
      });
    }

    const analyzer = new MUAlgorithm();
    const results = [];

    // Process each token
    for (const tokenAddress of tokenAddresses) {
      try {
        const result = await analyzer.analyzeToken(tokenAddress);
        results.push({
          success: true,
          tokenAddress,
          data: result
        });
      } catch (error) {
        results.push({
          success: false,
          tokenAddress,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      count: results.length,
      results,
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '50 batch requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Batch classify error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process batch classification'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/batch-risk
 * @desc    Calculate risk scores for multiple tokens (max 10)
 * @access  Private (requires API key with 'batch' permission)
 */
router.post('/batch-risk', verifyApiKey, checkPermission('batch'), async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one token address is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens allowed per batch request'
      });
    }

    const scorer = new TokenRiskScorer();
    const results = [];

    // Process each token
    for (const tokenAddress of tokenAddresses) {
      try {
        const result = await scorer.assessTokenRisk(tokenAddress);
        results.push({
          success: true,
          tokenAddress,
          data: result
        });
      } catch (error) {
        results.push({
          success: false,
          tokenAddress,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      count: results.length,
      results,
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '50 batch requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Batch risk error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process batch risk scoring'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/batch-full-analysis
 * @desc    Full analysis for multiple tokens (max 10)
 * @access  Private (requires API key with 'batch' permission)
 */
router.post('/batch-full-analysis', verifyApiKey, checkPermission('batch'), async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one token address is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens allowed per batch request'
      });
    }

    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();
    const jupiterChecker = new JupiterChecker();
    const results = [];

    // Process each token
    for (const tokenAddress of tokenAddresses) {
      try {
        const [classification, riskAssessment, jupiterData] = await Promise.all([
          analyzer.analyzeToken(tokenAddress),
          scorer.assessTokenRisk(tokenAddress),
          jupiterChecker.searchTokenByAddress(tokenAddress)
        ]);

        results.push({
          success: true,
          tokenAddress,
          data: {
            classification,
            riskAssessment,
            tokenInfo: jupiterData?.tokenInfo || null,
            jupiterData: jupiterData || null
          }
        });
      } catch (error) {
        results.push({
          success: false,
          tokenAddress,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      count: results.length,
      results,
      timestamp: new Date().toISOString(),
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '50 batch requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Batch full analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process batch full analysis'
    });
  }
});

/**
 * @route   POST /api/v1/mu-checker/prepare-registration
 * @desc    Analyze token and generate IPFS metadata for registration
 * @access  Private (requires API key with 'registration' permission)
 */
router.post('/prepare-registration', verifyApiKey, checkPermission('registration'), async (req, res) => {
  try {
    const { mintAddress, projectName, socials } = req.body;

    if (!mintAddress) {
      return res.status(400).json({
        success: false,
        error: 'Mint address is required'
      });
    }

    if (!projectName) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required'
      });
    }

    // Run analysis
    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();

    const [classification, riskAssessment] = await Promise.all([
      analyzer.analyzeToken(mintAddress),
      scorer.assessTokenRisk(mintAddress)
    ]);

    // TODO: Upload to IPFS (integrate with your existing IPFS logic)
    // For now, just return the metadata structure
    const metadata = {
      projectName,
      mintAddress,
      classification,
      riskAssessment,
      socials: socials || {},
      timestamp: new Date().toISOString(),
      verifiedBy: 'ChainProof'
    };

    res.json({
      success: true,
      message: 'Token analysis completed and metadata prepared',
      metadata,
      apiKeyUsed: req.apiKey.name,
      rateLimitInfo: {
        tier: 'premium',
        limit: '500 requests per 15 minutes'
      }
    });

  } catch (error) {
    console.error('Registration preparation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to prepare registration'
    });
  }
});

/**
 * @route   GET /api/v1/mu-checker/health
 * @desc    Health check for premium API
 * @access  Public
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'ChainProof Premium API',
    status: 'healthy',
    tier: 'premium',
    rateLimits: {
      standard: '500 requests per 15 minutes',
      batch: '50 requests per 15 minutes'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
