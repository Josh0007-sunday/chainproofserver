import axios from 'axios';

class TokenRiskScorer {
  constructor() {
    this.jupiterBaseUrl = 'https://lite-api.jup.ag/tokens/v2';
    this.solanaRpcUrl = 'https://mainnet.helius-rpc.com/?api-key=53b061f7-82e6-4436-a39e-fe1cbfdf0394';
  }

  /**
   * Calculate comprehensive risk score for a token
   * @param {string} tokenAddress - Solana token address
   * @returns {Object} Risk assessment with score and details
   */
  async assessTokenRisk(tokenAddress) {
    try {
      // Fetch token data from Jupiter
      const tokenData = await this.getTokenData(tokenAddress);
      
      if (!tokenData.success) {
        return {
          success: false,
          error: tokenData.error
        };
      }

      const token = tokenData.data;
      
      // Calculate individual risk scores
      const scores = {
        volumeScore: this.calculateVolumeScore(token),
        holderScore: await this.calculateHolderScore(tokenAddress),
        liquidityScore: this.calculateLiquidityScore(token),
        ageScore: this.calculateAgeScore(token),
        verificationScore: this.calculateVerificationScore(token),
        marketCapScore: this.calculateMarketCapScore(token)
      };

      // Calculate weighted total score (0-100, lower is better/safer)
      const totalScore = this.calculateWeightedScore(scores);
      
      // Determine risk level
      const riskLevel = this.getRiskLevel(totalScore);
      const recommendation = this.getRecommendation(totalScore);

      return {
        success: true,
        tokenAddress,
        tokenInfo: {
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.icon,
          isVerified: token.isVerified || false
        },
        riskScore: Math.round(totalScore),
        riskLevel,
        recommendation,
        detailedScores: scores,
        analysis: this.generateAnalysis(token, scores),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Risk assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get token data from Jupiter API
   */
  async getTokenData(address) {
    try {
      const response = await axios.get(
        `${this.jupiterBaseUrl}/search?query=${encodeURIComponent(address)}`,
        {
          headers: { 'Accept': 'application/json' },
          timeout: 10000
        }
      );

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return {
          success: true,
          data: response.data[0]
        };
      }

      return {
        success: false,
        error: 'Token not found'
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch token data: ${error.message}`
      };
    }
  }

  /**
   * Calculate volume score based on trading activity
   * Higher volume = lower risk (better)
   */
  calculateVolumeScore(token) {
    const volume24h = token.volume24h || 0;
    
    let score = 100; // Start with highest risk
    let rating = 'Very Low';

    if (volume24h >= 1000000) {
      score = 10;
      rating = 'Excellent';
    } else if (volume24h >= 500000) {
      score = 20;
      rating = 'Very Good';
    } else if (volume24h >= 100000) {
      score = 35;
      rating = 'Good';
    } else if (volume24h >= 50000) {
      score = 50;
      rating = 'Moderate';
    } else if (volume24h >= 10000) {
      score = 70;
      rating = 'Low';
    } else {
      score = 90;
      rating = 'Very Low';
    }

    return {
      score,
      rating,
      volume24h,
      description: `24h trading volume: $${volume24h.toLocaleString()}`
    };
  }

  /**
   * Calculate holder distribution score
   * More holders = lower risk (better decentralization)
   */
  async calculateHolderScore(tokenAddress) {
    try {
      // In a real implementation, you would fetch holder data from Solana RPC
      // This is a simplified version using estimated metrics
      
      // For now, we'll use a placeholder score
      // You can integrate with Helius, QuickNode, or Solana RPC for real data
      
      return {
        score: 50,
        rating: 'Moderate',
        estimatedHolders: 'Unknown',
        description: 'Holder data requires additional API integration'
      };

    } catch (error) {
      return {
        score: 60,
        rating: 'Unknown',
        estimatedHolders: 0,
        description: 'Unable to fetch holder data'
      };
    }
  }

  /**
   * Calculate liquidity score
   * Higher liquidity = lower risk
   */
  calculateLiquidityScore(token) {
    const mcap = token.mcap || 0;
    const volume24h = token.volume24h || 0;
    
    // Calculate volume to market cap ratio
    const volumeToMcapRatio = mcap > 0 ? (volume24h / mcap) * 100 : 0;

    let score = 100;
    let rating = 'Very Low';

    if (mcap >= 10000000) {
      score = 15;
      rating = 'Excellent';
    } else if (mcap >= 1000000) {
      score = 30;
      rating = 'Good';
    } else if (mcap >= 100000) {
      score = 50;
      rating = 'Moderate';
    } else if (mcap >= 10000) {
      score = 75;
      rating = 'Low';
    } else {
      score = 95;
      rating = 'Very Low';
    }

    return {
      score,
      rating,
      marketCap: mcap,
      volumeToMcapRatio: volumeToMcapRatio.toFixed(2) + '%',
      description: `Market cap: $${mcap.toLocaleString()}`
    };
  }

  /**
   * Calculate age score (contract age)
   * Older tokens = lower risk (more established)
   */
  calculateAgeScore(token) {
    // Jupiter API doesn't provide creation date directly
    // This would require additional Solana blockchain queries
    
    // For now, use verification and market presence as proxy
    const hasMarketCap = token.mcap > 0;
    const hasVolume = token.volume24h > 0;
    
    let score = 50;
    let rating = 'Unknown';

    if (token.isVerified && hasMarketCap && hasVolume) {
      score = 20;
      rating = 'Established';
    } else if (hasMarketCap && hasVolume) {
      score = 40;
      rating = 'Active';
    } else {
      score = 70;
      rating = 'New/Inactive';
    }

    return {
      score,
      rating,
      description: 'Token age estimation based on market activity'
    };
  }

  /**
   * Calculate verification score
   * Verified tokens = lower risk
   */
  calculateVerificationScore(token) {
    const isVerified = token.isVerified || false;
    
    return {
      score: isVerified ? 0 : 40,
      rating: isVerified ? 'Verified' : 'Unverified',
      isVerified,
      description: isVerified 
        ? 'Token is verified on Jupiter' 
        : 'Token is not verified - exercise caution'
    };
  }

  /**
   * Calculate market cap score
   */
  calculateMarketCapScore(token) {
    const mcap = token.mcap || 0;
    
    let score = 100;
    let rating = 'Micro Cap';

    if (mcap >= 100000000) {
      score = 5;
      rating = 'Large Cap';
    } else if (mcap >= 10000000) {
      score = 15;
      rating = 'Mid Cap';
    } else if (mcap >= 1000000) {
      score = 35;
      rating = 'Small Cap';
    } else if (mcap >= 100000) {
      score = 60;
      rating = 'Micro Cap';
    } else {
      score = 90;
      rating = 'Nano Cap';
    }

    return {
      score,
      rating,
      marketCap: mcap,
      description: `${rating}: $${mcap.toLocaleString()}`
    };
  }

  /**
   * Calculate weighted total score
   */
  calculateWeightedScore(scores) {
    const weights = {
      volumeScore: 0.20,      // 20%
      holderScore: 0.15,      // 15%
      liquidityScore: 0.25,   // 25%
      ageScore: 0.10,         // 10%
      verificationScore: 0.15, // 15%
      marketCapScore: 0.15    // 15%
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
      totalScore += scores[key].score * weight;
    }

    return totalScore;
  }

  /**
   * Get risk level based on score
   */
  getRiskLevel(score) {
    if (score <= 40) return 'SAFE';
    if (score <= 65) return 'MODERATE';
    return 'DANGER';
  }

  /**
   * Get recommendation based on score
   */
  getRecommendation(score) {
    if (score <= 40) {
      return 'Token shows strong fundamentals and market presence. Good for trading.';
    } else if (score <= 65) {
      return 'Proceed with caution. Some risk factors present but manageable.';
    } else {
      return 'High risk detected. Avoid trading unless you accept potential losses.';
    }
  }

  /**
   * Generate detailed analysis
   */
  generateAnalysis(token, scores) {
    const warnings = [];
    const positives = [];

    // Check for red flags
    if (!token.isVerified) {
      warnings.push('Token is not verified on Jupiter');
    }
    if ((token.volume24h || 0) < 10000) {
      warnings.push('Very low trading volume (possible low liquidity)');
    }
    if ((token.mcap || 0) < 100000) {
      warnings.push('Very low market cap (high volatility risk)');
    }

    // Check for positive indicators
    if (token.isVerified) {
      positives.push('Token is verified on Jupiter');
    }
    if ((token.volume24h || 0) >= 100000) {
      positives.push('Strong trading volume indicates active market');
    }
    if ((token.mcap || 0) >= 1000000) {
      positives.push('Significant market cap provides stability');
    }

    return {
      warnings: warnings.length > 0 ? warnings : ['No major warnings detected'],
      positives: positives.length > 0 ? positives : ['Limited positive indicators found'],
      summary: this.generateSummary(token, scores)
    };
  }

  /**
   * Generate analysis summary
   */
  generateSummary(token, scores) {
    const volume = token.volume24h || 0;
    const mcap = token.mcap || 0;
    
    return `${token.symbol} shows ${volume >= 100000 ? 'healthy' : 'limited'} trading activity ` +
           `with a ${mcap >= 1000000 ? 'substantial' : 'modest'} market presence. ` +
           `${token.isVerified ? 'Verification adds credibility.' : 'Lack of verification requires extra caution.'}`;
  }

  /**
   * Batch assess multiple tokens
   */
  async batchAssessRisk(tokenAddresses) {
    const results = [];
    
    for (const address of tokenAddresses) {
      const assessment = await this.assessTokenRisk(address);
      results.push(assessment);
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      success: true,
      count: results.length,
      results
    };
  }
}

// CLI Usage - ONLY runs when file is executed directly
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node riskscore.js <token-address>');
    console.error('Or: node riskscore.js --batch <address1> <address2> ...');
    process.exit(1);
  }

  const scorer = new TokenRiskScorer();

  try {
    if (args[0] === '--batch') {
      const addresses = args.slice(1);
      const result = await scorer.batchAssessRisk(addresses);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const result = await scorer.assessTokenRisk(args[0]);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, null, 2));
    process.exit(1);
  }
}

// CRITICAL FIX: Only run main() if this file is executed directly, NOT when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, null, 2));
    process.exit(1);
  });
}

export { TokenRiskScorer };