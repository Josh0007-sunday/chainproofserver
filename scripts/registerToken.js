// scripts/registerToken.js
import { MUAlgorithm } from './algo.js';
import { TokenRiskScorer } from './riskscore.js';
import { JupiterChecker } from './jupiterchecker.js';
import axios from 'axios';

class TokenRegistryManager {
  constructor(pinataApiKey, pinataSecretApiKey) {
    this.pinataApiKey = pinataApiKey;
    this.pinataSecretApiKey = pinataSecretApiKey;
    this.analyzer = new MUAlgorithm();
    this.scorer = new TokenRiskScorer();
    this.jupiter = new JupiterChecker();
  }

  async generateTokenData(mintAddress, projectName, socials = {}) {
    try {
      // Get analysis data
      const [analysisResult, riskResult, jupiterData] = await Promise.all([
        this.analyzer.analyzeToken(mintAddress),
        this.scorer.assessTokenRisk(mintAddress),
        this.jupiter.searchTokenByAddress(mintAddress)
      ]);

      // Get token symbol and icon from Jupiter
      const jupiterToken = jupiterData.success && jupiterData.data[0] ? jupiterData.data[0] : null;

      // Construct the exact JSON structure you specified
      const tokenData = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        tokenInfo: {
          mint: mintAddress,
          name: projectName,
          symbol: jupiterToken ? jupiterToken.symbol : 'UNKNOWN',
          icon: jupiterToken ? jupiterToken.logoURI : '',
          website: socials.website || '',
          twitter: socials.twitter || ''
        },
        riskAssessment: {
          riskScore: riskResult.success ? riskResult.riskScore : 0,
          riskLevel: riskResult.success ? riskResult.riskLevel : 'UNKNOWN',
          detailedScores: riskResult.success ? {
            volumeScore: { score: riskResult.detailedScores.volumeScore.score },
            holderScore: { score: riskResult.detailedScores.holderScore.score },
            liquidityScore: { score: riskResult.detailedScores.liquidityScore.score },
            ageScore: { score: riskResult.detailedScores.ageScore.score },
            verificationScore: { score: riskResult.detailedScores.verificationScore.score },
            marketCapScore: { score: riskResult.detailedScores.marketCapScore.score }
          } : {
            volumeScore: { score: 0 },
            holderScore: { score: 0 },
            liquidityScore: { score: 0 },
            ageScore: { score: 0 },
            verificationScore: { score: 0 },
            marketCapScore: { score: 0 }
          }
        },
        classification: {
          type: analysisResult.classification,
          utilityScore: analysisResult.utilityScore,
          memeScore: analysisResult.memeScore,
          breakdown: {
            verification: { score: analysisResult.analysis.verification.score },
            marketPresence: { score: analysisResult.analysis.marketPresence.score },
            tradingPatterns: { score: analysisResult.analysis.tradingPatterns.score },
            fundamentals: { score: analysisResult.analysis.fundamentals.score },
            community: { score: analysisResult.analysis.community.score },
            technical: { score: analysisResult.analysis.technical.score }
          }
        },
        metadata: {
          analyzedBy: "ChainProof MU Checker",
          analysisVersion: "1.0.0"
        }
      };

      return tokenData;
    } catch (error) {
      throw new Error(`Failed to generate token data: ${error.message}`);
    }
  }

  async uploadToPinata(tokenData) {
    try {
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        tokenData,
        {
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': this.pinataApiKey,
            'pinata_secret_api_key': this.pinataSecretApiKey
          }
        }
      );

      return response.data.IpfsHash;
    } catch (error) {
      throw new Error(`Failed to upload to Pinata: ${error.message}`);
    }
  }

  async registerToken(mintAddress, projectName, socials = {}) {
    try {
      // Generate analysis data
      const tokenData = await this.generateTokenData(mintAddress, projectName, socials);
      
      // Upload to IPFS
      const ipfsHash = await this.uploadToPinata(tokenData);
      
      // Save local copy with IPFS hash
      const finalData = {
        ...tokenData,
        metadata: {
          ...tokenData.metadata,
          ipfsHash: ipfsHash
        }
      };

      await this.saveLocalCopy(finalData, mintAddress);
      
      return {
        success: true,
        ipfsHash,
        tokenData: finalData,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async saveLocalCopy(tokenData, mintAddress) {
    const fs = await import('fs');
    const filename = `token_data_${mintAddress}_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(tokenData, null, 2));
    console.log(`Local copy saved: ${filename}`);
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node registerToken.js <mint-address> "<project-name>" [website] [twitter]');
    console.error('Example: node registerToken.js So11111111111111111111111111111111111111112 "Example Utility Token" https://example.com https://twitter.com/example');
    process.exit(1);
  }

  const mintAddress = args[0];
  const projectName = args[1];
  const socials = {
    website: args[2] || '',
    twitter: args[3] || ''
  };

  // You'll need to set these environment variables
  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;

  if (!pinataApiKey || !pinataSecretApiKey) {
    console.error('Please set PINATA_API_KEY and PINATA_SECRET_API_KEY environment variables');
    process.exit(1);
  }

  const registry = new TokenRegistryManager(pinataApiKey, pinataSecretApiKey);
  const result = await registry.registerToken(mintAddress, projectName, socials);
  
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TokenRegistryManager };