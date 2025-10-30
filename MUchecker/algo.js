import { JupiterChecker } from '../controllers/jupiterchecker.js';
import { TokenMetadataFetcher } from '../controllers/metadata.js';
import { TokenChecker } from '../controllers/tokenchecker.js';

class MUAlgorithm {
    constructor() {
        this.jupiterChecker = new JupiterChecker();
        this.metadataFetcher = new TokenMetadataFetcher();
        this.tokenChecker = new TokenChecker();
    }

    async analyzeToken(mintAddress) {
        try {
            const [jupiterData, metadata, coingeckoData] = await Promise.all([
                this.fetchJupiterData(mintAddress),
                this.metadataFetcher.fetchExtendedTokenMetadata(mintAddress),
                this.tokenChecker.checkTokenByAddress(mintAddress)
            ]);

            const analysis = this.performDeepAnalysis(metadata, jupiterData, coingeckoData, mintAddress);
            const finalScore = this.calculateFinalScore(analysis);
            const classificationType = this.determineClassification(finalScore);

            return {
                mint: mintAddress,
                classification: classificationType,  // Returns 'UTILITY' or 'MEME' string
                utilityScore: Math.round(finalScore.utility),
                memeScore: Math.round(finalScore.meme),
                analysis: analysis,
                logoURI: jupiterData.logoURI,
                finalScore: finalScore
            };

        } catch (error) {
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    async fetchJupiterData(mintAddress) {
        const result = await this.jupiterChecker.searchTokenByAddress(mintAddress);
        return result.success && result.data && result.data.length > 0 ? result.data[0] : null;
    }

    performDeepAnalysis(metadata, jupiterData, coingeckoData, mintAddress) {
        return {
            // Core Verification (Heavy weight)
            verification: this.analyzeVerification(metadata, jupiterData),
            
            // Market Presence
            marketPresence: this.analyzeMarketPresence(coingeckoData, jupiterData),
            
            // Trading Behavior
            tradingPatterns: this.analyzeTradingPatterns(jupiterData),
            
            // Token Fundamentals
            fundamentals: this.analyzeFundamentals(metadata, jupiterData),
            
            // Social & Community
            community: this.analyzeCommunity(jupiterData),
            
            // Technical Patterns
            technical: this.analyzeTechnical(mintAddress, jupiterData)
        };
    }

    analyzeVerification(metadata, jupiterData) {
        let score = 0;
        let reasons = [];

        // Base verification (Essential)
        if (jupiterData?.isVerified) {
            score += 30;
            reasons.push('Verified token');
        }

        // Strong utility indicators
        if (metadata?.description && metadata.description.length > 150) {
            score += 15;
            reasons.push('Detailed description');
        }
        
        if (metadata?.uri && metadata.uri.includes('github.com')) {
            score += 20;
            reasons.push('GitHub repository linked');
        }
        
        if (metadata?.uri && (metadata.uri.includes('whitepaper') || metadata.uri.includes('docs'))) {
            score += 15;
            reasons.push('Documentation available');
        }

        // Name analysis
        if (metadata?.name && !this.isMemeName(metadata.name)) {
            score += 10;
            reasons.push('Professional naming');
        }

        return { score: Math.min(score, 100), reasons };
    }

    analyzeMarketPresence(coingeckoData, jupiterData) {
        let score = 0;
        let reasons = [];

        // CoinGecko listing (Strong utility signal)
        if (coingeckoData.exists) {
            score += 40;
            reasons.push('Listed on CoinGecko');
        }

        // Market cap stability
        if (jupiterData?.mcap && jupiterData.mcap > 1000000) { // $1M+ market cap
            score += 20;
            reasons.push('Significant market cap');
        }

        // Liquidity depth
        if (jupiterData?.liquidity && jupiterData.liquidity > 50000) { // $50k+ liquidity
            score += 15;
            reasons.push('Deep liquidity');
        }

        return { score: Math.min(score, 100), reasons };
    }

    analyzeTradingPatterns(jupiterData) {
        if (!jupiterData?.stats1h || !jupiterData?.stats24h) {
            return { score: 50, reasons: ['Insufficient trading data'] };
        }

        let score = 50; // Start neutral
        let reasons = [];
        const stats1h = jupiterData.stats1h;
        const stats24h = jupiterData.stats24h;

        // Price stability (Critical for utility)
        const priceChange1h = Math.abs(stats1h.priceChange || 0);
        const priceChange24h = Math.abs(stats24h.priceChange || 0);
        
        if (priceChange1h < 3 && priceChange24h < 10) {
            score += 25;
            reasons.push('Excellent price stability');
        } else if (priceChange1h < 8 && priceChange24h < 20) {
            score += 15;
            reasons.push('Good price stability');
        } else if (priceChange1h > 30 || priceChange24h > 60) {
            score -= 20;
            reasons.push('Extreme price volatility');
        }

        // Organic activity (Strong utility indicator)
        const organicScore = jupiterData.organicScore || 0;
        if (organicScore >= 60) {
            score += 20;
            reasons.push('High organic score');
        } else if (organicScore >= 40) {
            score += 10;
            reasons.push('Moderate organic score');
        }

        // Holder growth pattern
        const holderGrowth1h = stats1h.holderChange || 0;
        const holderGrowth24h = stats24h.holderChange || 0;
        
        if (holderGrowth1h > 0.1 && holderGrowth24h > 1) {
            score += 15;
            reasons.push('Steady holder growth');
        }

        // Trading quality
        const organicRatio24h = (stats24h.numOrganicBuyers || 0) / Math.max(stats24h.numTraders || 1, 1);
        if (organicRatio24h > 0.3) {
            score += 15;
            reasons.push('High organic trading activity');
        }

        return { score: Math.max(0, Math.min(score, 100)), reasons };
    }

    analyzeFundamentals(metadata, jupiterData) {
        let score = 0;
        let reasons = [];

        // Supply analysis
        if (metadata?.supply) {
            const supply = parseFloat(metadata.supply);
            if (supply > 1000000) { // Reasonable supply size
                score += 15;
                reasons.push('Reasonable token supply');
            }
        }

        // Decimals (utility tokens often have standard decimals)
        if (metadata?.decimals === 6 || metadata?.decimals === 9) {
            score += 10;
            reasons.push('Standard decimal places');
        }

        // Developer activity
        if (jupiterData?.dev) {
            score += 10;
            reasons.push('Developer address identified');
        }

        // Token age (if available in metadata)
        if (jupiterData?.firstPool?.createdAt) {
            const tokenAge = Date.now() - new Date(jupiterData.firstPool.createdAt).getTime();
            const ageInDays = tokenAge / (1000 * 60 * 60 * 24);
            if (ageInDays > 30) {
                score += 15;
                reasons.push('Established token age');
            }
        }

        return { score: Math.min(score, 100), reasons };
    }

    analyzeCommunity(jupiterData) {
        let score = 50; // Start neutral
        let reasons = [];

        // Community engagement
        if (jupiterData?.holderCount && jupiterData.holderCount > 1000) {
            score += 20;
            reasons.push('Large holder community');
        }

        // Social signals
        if (jupiterData?.ctLikes && jupiterData.ctLikes > 10) {
            score += 10;
            reasons.push('Community engagement');
        }

        // Holder distribution
        if (jupiterData?.audit?.topHoldersPercentage < 60) {
            score += 15;
            reasons.push('Healthy holder distribution');
        } else if (jupiterData?.audit?.topHoldersPercentage > 80) {
            score -= 15;
            reasons.push('Concentrated holder distribution');
        }

        return { score: Math.max(0, Math.min(score, 100)), reasons };
    }

    analyzeTechnical(mintAddress, jupiterData) {
        let score = 50; // Start neutral
        let reasons = [];

        // Address pattern
        if (!mintAddress.toLowerCase().endsWith('pump')) {
            score += 15;
            reasons.push('Professional address pattern');
        } else {
            score -= 20;
            reasons.push('Meme-style address pattern');
        }

        // Security features
        if (jupiterData?.audit?.mintAuthorityDisabled) {
            score += 15;
            reasons.push('Mint authority disabled');
        }

        if (jupiterData?.audit?.freezeAuthorityDisabled) {
            score += 10;
            reasons.push('Freeze authority disabled');
        }

        return { score: Math.max(0, Math.min(score, 100)), reasons };
    }

    isMemeName(name) {
        const memePatterns = [
            /dog/i, /cat/i, /shib/i, /bonk/i, /pepe/i, /woof/i, /monke/i, 
            /doge/i, /floki/i, /squid/i, /elon/i, /moon/i, /mars/i, /rocket/i,
            /pump/i, /dump/i, /lambo/i, /to the moon/i
        ];
        return memePatterns.some(pattern => pattern.test(name));
    }

    calculateFinalScore(analysis) {
        const weights = {
            verification: 0.30,   // 30% - Most important
            marketPresence: 0.25, // 25% - Market legitimacy
            tradingPatterns: 0.20, // 20% - Trading behavior
            fundamentals: 0.10,   // 10% - Token basics
            community: 0.10,      // 10% - Community health
            technical: 0.05       // 5% - Technical patterns
        };

        let utilityScore = 0;
        let memeScore = 0;

        for (const [category, data] of Object.entries(analysis)) {
            const weight = weights[category];
            utilityScore += data.score * weight;
        }

        memeScore = 100 - utilityScore;

        return {
            utility: Math.max(0, Math.min(100, utilityScore)),
            meme: Math.max(0, Math.min(100, memeScore))
        };
    }

    determineClassification(finalScore) {
        const { utility, meme } = finalScore;

        // Simple direct comparison - if utility score is greater than meme score, it's UTILITY
        if (utility > meme) {
            return 'UTILITY';
        }

        // If meme score is greater than utility score, it's MEME
        if (meme > utility) {
            return 'MEME';
        }

        // If scores are exactly equal (rare case), return UNCATEGORIZED
        return 'UNCATEGORIZED';
    }
}

// Command line interface - ONLY runs when file is executed directly
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node algo.js <token-mint-address>');
        process.exit(1);
    }

    const mintAddress = args[0];
    const analyzer = new MUAlgorithm();

    try {
        const result = await analyzer.analyzeToken(mintAddress);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(JSON.stringify({
            error: error.message
        }, null, 2));
        process.exit(1);
    }
}

// CRITICAL FIX: Only run main() if this file is executed directly, NOT when imported
if (import.meta.url === `file://${process.argv[1]}`) {
    process.on('unhandledRejection', (error) => {
        console.error(JSON.stringify({
            error: `Unhandled rejection: ${error.message}`
        }, null, 2));
        process.exit(1);
    });

    main().catch(error => {
        console.error(JSON.stringify({
            error: error.message
        }, null, 2));
        process.exit(1);
    });
}

export { MUAlgorithm };