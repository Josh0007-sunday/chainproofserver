import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createTransferInstruction } from '@solana/spl-token';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, web3, BN } = pkg;
import provider from '@coral-xyz/anchor/dist/cjs/provider.js';
const { Wallet } = provider;
import bs58 from 'bs58';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const idl = JSON.parse(readFileSync(join(__dirname, '../chainproof_idl.json'), 'utf8'));

const PROGRAM_ID = new PublicKey('D6yD4d3ZEGxpdgbFHWTwMSpr9iGrnapLK5QCLvehoiDr');
const STAKE_TOKEN_MINT = new PublicKey('2FKjWV4zh7AVsmXonL7AM9Lh9zfpcE3e1dCYejWvd5W8');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Service to handle reward pool deposits from x402 payments
 */
class RewardPoolService {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    this.program = null;
    this.initialized = false;
  }

  /**
   * Initialize the Anchor program
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Get the server wallet keypair from environment
      const serverKeypairString = process.env.SERVER_WALLET_KEYPAIR;
      if (!serverKeypairString) {
        console.warn('⚠️  SERVER_WALLET_KEYPAIR not set. Reward pool deposits will be skipped.');
        return;
      }

      const secretKey = bs58.decode(serverKeypairString);
      const keypair = web3.Keypair.fromSecretKey(secretKey);

      // Create provider
      const wallet = new Wallet(keypair);
      const provider = new AnchorProvider(
        this.connection,
        wallet,
        { commitment: 'confirmed' }
      );

      // Initialize program
      this.program = new Program(idl, PROGRAM_ID, provider);
      this.wallet = wallet;
      this.initialized = true;

      console.log('✅ Reward Pool Service initialized');
      console.log(`📍 Server wallet: ${keypair.publicKey.toString()}`);
    } catch (error) {
      console.error('❌ Failed to initialize Reward Pool Service:', error.message);
    }
  }

  /**
   * Deposit funds to the reward pool
   * @param {number} amountLamports - Amount in lamports (for USDC: 1 USDC = 1,000,000 lamports)
   * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
   */
  async depositToPool(amountLamports) {
    try {
      if (!this.initialized || !this.program) {
        await this.initialize();
        if (!this.initialized) {
          return {
            success: false,
            error: 'Reward pool service not initialized'
          };
        }
      }

      // Get reward pool PDA
      const [rewardPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reward_pool')],
        PROGRAM_ID
      );

      // Get depositor's token account
      const depositorTokenAccount = await getAssociatedTokenAddress(
        STAKE_TOKEN_MINT,
        this.wallet.publicKey
      );

      // Get pool vault
      const poolVault = await getAssociatedTokenAddress(
        STAKE_TOKEN_MINT,
        rewardPoolPda,
        true
      );

      // Call deposit_to_pool instruction
      const tx = await this.program.methods
        .depositToPool(new BN(amountLamports))
        .accounts({
          depositor: this.wallet.publicKey,
          rewardPool: rewardPoolPda,
          depositorTokenAccount,
          poolVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(`✅ Deposited ${amountLamports / 1_000_000} USDC to reward pool. Tx: ${tx}`);

      return {
        success: true,
        signature: tx
      };
    } catch (error) {
      console.error('❌ Error depositing to reward pool:', error);
      return {
        success: false,
        error: error.message || 'Failed to deposit to reward pool'
      };
    }
  }

  /**
   * Deposit 0.1 USDC to reward pool (for public API calls)
   * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
   */
  async depositPublicApiPayment() {
    const AMOUNT = 100_000; // 0.1 USDC (6 decimals)
    return await this.depositToPool(AMOUNT);
  }

  /**
   * Check if reward pool is initialized
   * @returns {Promise<boolean>}
   */
  async isRewardPoolInitialized() {
    try {
      if (!this.program) await this.initialize();
      if (!this.program) return false;

      const [rewardPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reward_pool')],
        PROGRAM_ID
      );

      const account = await this.program.account.rewardPool.fetchNullable(rewardPoolPda);
      return account !== null;
    } catch (error) {
      console.error('Error checking reward pool:', error);
      return false;
    }
  }
}

// Export a singleton instance
const rewardPoolService = new RewardPoolService();
export default rewardPoolService;
