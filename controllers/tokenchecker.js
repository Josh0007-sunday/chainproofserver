import axios from 'axios';

class TokenChecker {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async checkTokenByAddress(solanaAddress) {
    try {
      // First, get all Solana tokens from CoinGecko
      const response = await axios.get(`${this.baseUrl}/coins/list?include_platform=true`);
      const tokens = response.data;

      // Find token by Solana address
      const token = tokens.find(t => 
        t.platforms?.solana?.toLowerCase() === solanaAddress.toLowerCase()
      );

      if (token) {
        return {
          exists: true,
          coinGeckoId: token.id,
          symbol: token.symbol,
          name: token.name,
          solanaAddress: token.platforms.solana
        };
      }

      return {
        exists: false,
        error: 'Token not found on CoinGecko'
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          exists: false,
          error: `CoinGecko API error: ${error.response?.status} ${error.response?.statusText}`
        };
      }
      
      return {
        exists: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async checkTokenBySymbol(symbol) {
    try {
      const response = await axios.get(`${this.baseUrl}/coins/list?include_platform=true`);
      const tokens = response.data;

      const matchingTokens = tokens.filter(t => 
        t.symbol.toLowerCase() === symbol.toLowerCase() && 
        t.platforms?.solana
      );

      return matchingTokens.map(token => ({
        exists: true,
        coinGeckoId: token.id,
        symbol: token.symbol,
        name: token.name,
        solanaAddress: token.platforms.solana
      }));

    } catch (error) {
      return [{
        exists: false,
        error: `API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }];
    }
  }

  async getTokenDetails(coinGeckoId) {
    try {
      const response = await axios.get(`${this.baseUrl}/coins/${coinGeckoId}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async checkMultipleAddresses(addresses) {
    const results = {};
    
    for (const address of addresses) {
      results[address] = await this.checkTokenByAddress(address);
    }
    
    return results;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node tokenchecker.js <solana-address>');
    console.error('Or: node tokenchecker.js --symbol <token-symbol>');
    console.error('Or: node tokenchecker.js --multiple <address1,address2,...>');
    process.exit(1);
  }

  const checker = new TokenChecker();

  try {
    if (args[0] === '--symbol' && args[1]) {
      // Search by symbol
      const results = await checker.checkTokenBySymbol(args[1]);
      console.log(JSON.stringify(results, null, 2));
      
    } else if (args[0] === '--multiple' && args[1]) {
      // Check multiple addresses
      const addresses = args[1].split(',').map(addr => addr.trim());
      const results = await checker.checkMultipleAddresses(addresses);
      console.log(JSON.stringify(results, null, 2));
      
    } else if (args[0] === '--details' && args[1]) {
      // Get detailed information for a CoinGecko ID
      const details = await checker.getTokenDetails(args[1]);
      console.log(JSON.stringify(details, null, 2));
      
    } else {
      // Check single address
      const solanaAddress = args[0];
      const result = await checker.checkTokenByAddress(solanaAddress);
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, null, 2));
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error(JSON.stringify({
    error: `Unhandled rejection: ${error instanceof Error ? error.message : error}`
  }, null, 2));
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, null, 2));
    process.exit(1);
  });
}

export { TokenChecker };