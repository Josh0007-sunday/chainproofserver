import express from 'express';
import { MUAlgorithm } from '../MUchecker/algo.js';
import { TokenRiskScorer } from '../MUchecker/riskscore.js';
import { JupiterChecker } from '../controllers/jupiterchecker.js';
import { verifyApiKey, checkPermission } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/mu-checker/analyze
 * @desc    Analyze token classification (MEME vs UTILITY)
 * @access  Public
 */
router.post('/analyze', async (req, res) => {
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
      data: result
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
 * @route   POST /api/mu-checker/risk-score
 * @desc    Calculate token risk score (SAFE, MODERATE, DANGER)
 * @access  Public
 */
router.post('/risk-score', async (req, res) => {
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

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Risk scoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate risk score'
    });
  }
});

/**
 * @route   POST /api/mu-checker/full-analysis
 * @desc    Get both classification and risk score in one call
 * @access  Public
 */
router.post('/full-analysis', async (req, res) => {
  try {
    const { tokenAddress } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address is required'
      });
    }

    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();
    const jupiterChecker = new JupiterChecker();

    // Run all analyses in parallel with error handling
    const [classificationResult, riskResult, jupiterResult] = await Promise.allSettled([
      analyzer.analyzeToken(tokenAddress),
      scorer.assessTokenRisk(tokenAddress),
      jupiterChecker.searchTokenByAddress(tokenAddress)
    ]);

    // Handle classification result
    let classification = null;
    if (classificationResult.status === 'fulfilled') {
      classification = {
        type: classificationResult.value.classification,
        utilityScore: classificationResult.value.utilityScore,
        memeScore: classificationResult.value.memeScore,
        analysis: classificationResult.value.analysis
      };
    } else {
      console.error('Classification error:', classificationResult.reason);
    }

    // Handle risk assessment result
    let riskAssessment = null;
    let tokenInfo = null;
    
    if (riskResult.status === 'fulfilled' && riskResult.value.success) {
      riskAssessment = {
        riskLevel: riskResult.value.riskLevel,
        riskScore: riskResult.value.riskScore,
        recommendation: riskResult.value.recommendation,
        detailedScores: riskResult.value.detailedScores,
        analysis: riskResult.value.analysis
      };
      tokenInfo = riskResult.value.tokenInfo;
      tokenInfo.logoURI = riskResult.value.tokenInfo.logoURI;
    } else {
      console.error('Risk assessment error:', 
        riskResult.status === 'fulfilled' ? riskResult.value.error : riskResult.reason
      );
      // Provide fallback risk assessment
      riskAssessment = {
        riskLevel: 'UNKNOWN',
        riskScore: null,
        recommendation: 'Unable to assess risk - data unavailable',
        detailedScores: {},
        analysis: {
          warnings: ['Risk assessment failed'],
          positives: [],
          summary: 'Could not calculate risk score'
        }
      };
    }

    // Handle Jupiter data
    let jupiterData = null;
    if (jupiterResult.status === 'fulfilled' && jupiterResult.value.success) {
      jupiterData = jupiterResult.value.data[0];
    }

    // Return response even if one analysis fails
    res.json({
      success: true,
      tokenAddress,
      classification,
      riskAssessment,
      tokenInfo,
      jupiterData,
      timestamp: new Date().toISOString(),
      warnings: [
        ...(classificationResult.status === 'rejected' ? ['Classification analysis failed'] : []),
        ...(riskResult.status === 'rejected' || !riskResult.value?.success ? ['Risk assessment failed'] : []),
        ...(jupiterResult.status === 'rejected' || !jupiterResult.value?.success ? ['Jupiter data fetch failed'] : [])
      ]
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
 * @route   POST /api/mu-checker/batch-risk
 * @desc    Calculate risk scores for multiple tokens
 * @access  Public
 */
router.post('/batch-risk', async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens can be analyzed at once'
      });
    }

    const scorer = new TokenRiskScorer();
    const result = await scorer.batchAssessRisk(tokenAddresses);

    res.json(result);

  } catch (error) {
    console.error('Batch risk analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform batch analysis'
    });
  }
});

/**
 * @route   POST /api/mu-checker/batch-classify
 * @desc    Classify multiple tokens (MEME vs UTILITY)
 * @access  Public
 */
router.post('/batch-classify', async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens can be analyzed at once'
      });
    }

    const analyzer = new MUAlgorithm();
    const results = [];

    for (const address of tokenAddresses) {
      try {
        const result = await analyzer.analyzeToken(address);
        results.push({
          success: true,
          tokenAddress: address,
          data: result
        });
      } catch (error) {
        results.push({
          success: false,
          tokenAddress: address,
          error: error.message
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      count: results.length,
      results
    });

  } catch (error) {
    console.error('Batch classification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform batch classification'
    });
  }
});

/**
 * @route   POST /api/mu-checker/batch-full-analysis
 * @desc    Get both classification and risk score for multiple tokens
 * @access  Public
 */
router.post('/batch-full-analysis', async (req, res) => {
  try {
    const { tokenAddresses } = req.body;

    if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddresses array is required'
      });
    }

    if (tokenAddresses.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tokens can be analyzed at once'
      });
    }

    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();
    const jupiterChecker = new JupiterChecker();
    const results = [];

    for (const address of tokenAddresses) {
      const [classificationResult, riskResult, jupiterResult] = await Promise.allSettled([
        analyzer.analyzeToken(address),
        scorer.assessTokenRisk(address),
        jupiterChecker.searchTokenByAddress(address)
      ]);

      let classification = null;
      if (classificationResult.status === 'fulfilled') {
        classification = {
          type: classificationResult.value.classification,
          utilityScore: classificationResult.value.utilityScore,
          memeScore: classificationResult.value.memeScore,
        };
      }

      let riskAssessment = null;
      let tokenInfo = null;
      if (riskResult.status === 'fulfilled' && riskResult.value.success) {
        riskAssessment = {
          riskLevel: riskResult.value.riskLevel,
          riskScore: riskResult.value.riskScore,
        };
        tokenInfo = riskResult.value.tokenInfo;
        console.log('Token Info:', tokenInfo);
      }

      let jupiterData = null;
      if (jupiterResult.status === 'fulfilled' && jupiterResult.value.success) {
        jupiterData = jupiterResult.value.data[0];
      }

      results.push({
        success: true,
        tokenAddress: address,
        classification,
        riskAssessment,
        tokenInfo,
        jupiterData,
        warnings: [
          ...(classificationResult.status === 'rejected' ? ['Classification analysis failed'] : []),
          ...(riskResult.status === 'rejected' || !riskResult.value?.success ? ['Risk assessment failed'] : []),
          ...(jupiterResult.status === 'rejected' || !jupiterResult.value?.success ? ['Jupiter data fetch failed'] : [])
        ]
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      count: results.length,
      results
    });

  } catch (error) {
    console.error('Batch full analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform batch full analysis'
    });
  }
});

/**
 * @route   POST /api/mu-checker/prepare-registration
 * @desc    Analyze token, generate metadata JSON, and upload to Pinata
 * @access  Public
 */
router.post('/prepare-registration', async (req, res) => {
  try {
    const { mintAddress, projectName, socials } = req.body;

    if (!mintAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token mint address is required'
      });
    }

    console.log(`🔍 Preparing registration for token: ${mintAddress}`);

    const analyzer = new MUAlgorithm();
    const scorer = new TokenRiskScorer();
    const jupiterChecker = new JupiterChecker();

    // Run all analyses in parallel
    const [analysisResult, riskResult, jupiterResult] = await Promise.allSettled([
      analyzer.analyzeToken(mintAddress),
      scorer.assessTokenRisk(mintAddress),
      jupiterChecker.searchTokenByAddress(mintAddress)
    ]);

    // Get token info from risk result (which includes logoURI) or Jupiter
    let tokenName = projectName;
    let tokenSymbol = 'UNKNOWN';
    let tokenIcon = '';

    // Priority 1: Get from risk assessment result (includes logoURI from token data)
    if (riskResult.status === 'fulfilled' && riskResult.value.success && riskResult.value.tokenInfo) {
      tokenSymbol = riskResult.value.tokenInfo.symbol || tokenSymbol;
      tokenName = tokenName || riskResult.value.tokenInfo.name || 'Unknown Token';
      tokenIcon = riskResult.value.tokenInfo.logoURI || '';
    }

    // Priority 2: Fallback to Jupiter data
    const jupiterToken = jupiterResult.status === 'fulfilled' &&
                        jupiterResult.value.success &&
                        jupiterResult.value.data[0]
                        ? jupiterResult.value.data[0]
                        : null;

    if (jupiterToken) {
      tokenSymbol = jupiterToken.symbol || tokenSymbol;
      tokenName = tokenName || jupiterToken.name || 'Unknown Token';
      tokenIcon = tokenIcon || jupiterToken.logoURI || '';
    }

    // Construct the JSON metadata
    const tokenData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tokenInfo: {
        mint: mintAddress,
        name: tokenName,
        symbol: tokenSymbol,
        icon: tokenIcon,
        website: socials?.website || '',
        twitter: socials?.twitter || ''
      },
      riskAssessment: riskResult.status === 'fulfilled' && riskResult.value.success ? {
        riskScore: riskResult.value.riskScore,
        riskLevel: riskResult.value.riskLevel,
        detailedScores: {
          volumeScore: { score: riskResult.value.detailedScores.volumeScore.score },
          holderScore: { score: riskResult.value.detailedScores.holderScore.score },
          liquidityScore: { score: riskResult.value.detailedScores.liquidityScore.score },
          ageScore: { score: riskResult.value.detailedScores.ageScore.score },
          verificationScore: { score: riskResult.value.detailedScores.verificationScore.score },
          marketCapScore: { score: riskResult.value.detailedScores.marketCapScore.score }
        }
      } : {
        riskScore: 0,
        riskLevel: 'UNKNOWN',
        detailedScores: {
          volumeScore: { score: 0 },
          holderScore: { score: 0 },
          liquidityScore: { score: 0 },
          ageScore: { score: 0 },
          verificationScore: { score: 0 },
          marketCapScore: { score: 0 }
        }
      },
      classification: analysisResult.status === 'fulfilled' ? {
        type: analysisResult.value.classification,
        utilityScore: analysisResult.value.utilityScore,
        memeScore: analysisResult.value.memeScore,
        breakdown: {
          verification: { score: analysisResult.value.analysis.verification.score },
          marketPresence: { score: analysisResult.value.analysis.marketPresence.score },
          tradingPatterns: { score: analysisResult.value.analysis.tradingPatterns.score },
          fundamentals: { score: analysisResult.value.analysis.fundamentals.score },
          community: { score: analysisResult.value.analysis.community.score },
          technical: { score: analysisResult.value.analysis.technical.score }
        }
      } : {
        type: 'UNKNOWN',
        utilityScore: 0,
        memeScore: 0,
        breakdown: {}
      },
      metadata: {
        analyzedBy: "ChainProof MU Checker",
        analysisVersion: "1.0.0"
      }
    };

    console.log(`📤 Uploading to Pinata...`);
    console.log(`🔍 Debug - process.env.PINATA_JWT exists:`, !!process.env.PINATA_JWT);
    console.log(`🔍 Debug - All env keys:`, Object.keys(process.env).filter(k => k.includes('PINATA')));

    // Upload to Pinata using JWT (recommended method)
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
      console.error('❌ PINATA_JWT is undefined. Available env vars:', Object.keys(process.env).filter(k => k.includes('PIN')));
      throw new Error('PINATA_JWT environment variable is not set');
    }

    const axios = (await import('axios')).default;
    const pinataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      tokenData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PINATA_JWT}`
        }
      }
    );

    const ipfsHash = pinataResponse.data.IpfsHash;
    const gatewayUrl = `https://maroon-solid-leech-193.mypinata.cloud/ipfs/${ipfsHash}`;

    console.log(`✅ Uploaded to IPFS: ${ipfsHash}`);

    // Return token data for preview + IPFS info for registration
    res.json({
      success: true,
      tokenData: {
        mint: mintAddress,
        name: tokenName,
        symbol: tokenSymbol,
        icon: tokenIcon,
        ipfsHash,
        gatewayUrl,
        riskLevel: tokenData.riskAssessment.riskLevel,
        riskScore: tokenData.riskAssessment.riskScore,
        classification: tokenData.classification.type
      },
      fullMetadata: tokenData,
      warnings: [
        ...(analysisResult.status === 'rejected' ? ['Classification analysis failed'] : []),
        ...(riskResult.status === 'rejected' || !riskResult.value?.success ? ['Risk assessment failed'] : []),
        ...(jupiterResult.status === 'rejected' || !jupiterResult.value?.success ? ['Jupiter data fetch failed'] : [])
      ]
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
 * @route   GET /api/mu-checker/health
 * @desc    Check if MU Checker API is running
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MU Checker API is running',
    services: {
      classification: 'Available',
      riskScoring: 'Available'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;