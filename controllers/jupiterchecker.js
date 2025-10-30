import axios from 'axios';

class JupiterChecker {
  constructor() {
    this.baseUrl = 'https://lite-api.jup.ag/tokens/v2';
  }

  async searchToken(query) {
    try {
      const config = {
        method: 'get',
        url: `${this.baseUrl}/search?query=${encodeURIComponent(query)}`,
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      };

      const response = await axios.request(config);
      
      if (response.data && Array.isArray(response.data)) {
        return {
          success: true,
          data: response.data
        };
      } else {
        return {
          success: false,
          error: 'Invalid response format from Jupiter API'
        };
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `Jupiter API error: ${error.response.status} ${error.response.statusText}`
          };
        } else if (error.request) {
          return {
            success: false,
            error: 'No response received from Jupiter API'
          };
        }
      }
      
      return {
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async searchTokenByAddress(address) {
    return this.searchToken(address);
  }

  async searchTokenByName(name) {
    return this.searchToken(name);
  }

  async searchTokenBySymbol(symbol) {
    return this.searchToken(symbol);
  }

  async getTokenList() {
    try {
      const config = {
        method: 'get',
        url: `${this.baseUrl}/all`,
        headers: {
          'Accept': 'application/json'
        },
        timeout: 15000
      };

      const response = await axios.request(config);
      
      if (response.data && Array.isArray(response.data)) {
        return {
          success: true,
          data: response.data
        };
      } else {
        return {
          success: false,
          error: 'Invalid response format from Jupiter API'
        };
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: `Jupiter API error: ${error.response?.status} ${error.response?.statusText}`
        };
      }
      
      return {
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getTopTokens(limit = 50) {
    try {
      const allTokens = await this.getTokenList();
      
      if (!allTokens.success || !allTokens.data) {
        return allTokens;
      }

      // Sort by market cap (descending) and take top N
      const topTokens = allTokens.data
        .filter(token => token.mcap > 0)
        .sort((a, b) => b.mcap - a.mcap)
        .slice(0, limit);

      return {
        success: true,
        data: topTokens
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to get top tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getVerifiedTokens() {
    try {
      const allTokens = await this.getTokenList();
      
      if (!allTokens.success || !allTokens.data) {
        return allTokens;
      }

      const verifiedTokens = allTokens.data.filter(token => token.isVerified);

      return {
        success: true,
        data: verifiedTokens
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to get verified tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node jupiterchecker.js <token-address|name|symbol>');
    console.error('Or: node jupiterchecker.js --list');
    console.error('Or: node jupiterchecker.js --top <limit>');
    console.error('Or: node jupiterchecker.js --verified');
    process.exit(1);
  }

  const checker = new JupiterChecker();

  try {
    if (args[0] === '--list' && args.length === 1) {
      // Get all tokens
      const result = await checker.getTokenList();
      console.log(JSON.stringify(result, null, 2));
      
    } else if (args[0] === '--top' && args[1]) {
      // Get top tokens by market cap
      const limit = parseInt(args[1]) || 50;
      const result = await checker.getTopTokens(limit);
      console.log(JSON.stringify(result, null, 2));
      
    } else if (args[0] === '--verified' && args.length === 1) {
      // Get verified tokens only
      const result = await checker.getVerifiedTokens();
      console.log(JSON.stringify(result, null, 2));
      
    } else {
      // Search by address, name, or symbol
      const query = args[0];
      const result = await checker.searchToken(query);
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

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error(JSON.stringify({
    success: false,
    error: `Unhandled rejection: ${error instanceof Error ? error.message : error}`
  }, null, 2));
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, null, 2));
    process.exit(1);
  });
}

export { JupiterChecker };
