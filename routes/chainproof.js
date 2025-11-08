import express from 'express';
import { MUAlgorithm } from '../MUchecker/algo.js';
import { TokenRiskScorer } from '../MUchecker/riskscore.js';
import { JupiterChecker } from '../controllers/jupiterchecker.js';

const router = express.Router();

/**
 * @route   POST /api/chainproof/token-analysis
 * @desc    Get full token analysis (classification + risk score + Jupiter data)
 * @access  Public (No x402 payment required - for ChainProof product use only)
 */
router.post('/token-analysis', async (req, res) => {
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
    console.error('ChainProof token analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze token'
    });
  }
});

export default router;
