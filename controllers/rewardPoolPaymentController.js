import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import Payment from '../models/Payment.js';

/**
 * Payment controller specifically for reward pool x402 payments
 * This handles payments that go directly to the smart contract reward pool
 */
class RewardPoolPaymentController {
  constructor() {
    // Initialize Solana connection based on network
    const network = process.env.X402_NETWORK || 'solana-devnet';
    const rpcUrl = network === 'solana-devnet'
      ? process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
      : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');

    // Use stake token mint (USDC for devnet)
    this.tokenMint = process.env.STAKE_TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

    // 0.1 USDC = 100,000 (6 decimals for USDC)
    this.requiredAmount = 100000;

    this.network = network;

    // Smart contract program ID
    this.programId = new PublicKey('D6yD4d3ZEGxpdgbFHWTwMSpr9iGrnapLK5QCLvehoiDr');

    // Calculate reward pool vault address
    this.initializePoolVault();
  }

  /**
   * Initialize the reward pool vault address
   */
  async initializePoolVault() {
    try {
      // Derive reward pool PDA
      const [rewardPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reward_pool')],
        this.programId
      );

      // Get the associated token account for the reward pool
      const poolVault = await getAssociatedTokenAddress(
        new PublicKey(this.tokenMint),
        rewardPoolPda,
        true // allowOwnerOffCurve = true for PDA
      );

      this.rewardPoolVault = poolVault.toBase58();

      console.log('✅ Reward Pool Payment Controller initialized');
      console.log(`📍 Reward Pool Vault: ${this.rewardPoolVault}`);
      console.log(`💰 Payment amount: ${this.requiredAmount / 1_000_000} USDC`);
    } catch (error) {
      console.error('❌ Error initializing pool vault:', error);
    }
  }

  /**
   * Get payment requirements for x402 response
   * Returns the reward pool vault as the recipient
   */
  getPaymentRequirements() {
    if (!this.rewardPoolVault) {
      throw new Error('Reward pool vault not initialized');
    }

    return {
      recipient: this.rewardPoolVault,
      amount: this.requiredAmount,
      token: this.tokenMint,
      network: this.network,
      description: 'Payment for ChainProof Public API - Revenue goes to reward pool'
    };
  }

  /**
   * Validates and processes an x402 payment to reward pool
   * @param {string} serializedTransaction - Base64 encoded transaction
   * @param {string} endpoint - API endpoint being accessed
   * @param {string} userId - Optional user ID
   * @returns {Object} Payment verification result
   */
  async verifyPayment(serializedTransaction, endpoint, userId = null) {
    try {
      const { Transaction } = await import('@solana/web3.js');

      // Step 1: Decode the transaction
      const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
      const transaction = Transaction.from(transactionBuffer);

      // Step 2: Extract signature
      const signature = transaction.signatures[0];
      if (!signature || !signature.signature) {
        throw new Error('Invalid transaction signature');
      }

      const signatureBase58 = Buffer.from(signature.signature).toString('base64');

      // Step 3: Check if payment already exists
      const existingPayment = await Payment.findOne({
        transactionSignature: signatureBase58
      });

      if (existingPayment) {
        if (existingPayment.status === 'confirmed') {
          return {
            success: true,
            payment: existingPayment,
            message: 'Payment already confirmed'
          };
        }

        if (existingPayment.status === 'failed') {
          throw new Error('Transaction previously failed verification');
        }
      }

      // Step 4: Validate transaction instructions
      const validationResult = this.validateTransactionInstructions(transaction);
      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }

      // Step 5: Submit transaction to blockchain if not already submitted
      let txSignature;
      try {
        txSignature = await this.connection.sendRawTransaction(
          transactionBuffer,
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          }
        );
      } catch (error) {
        // Check if transaction is already on-chain
        if (error.message && (
          error.message.includes('already processed') ||
          error.message.includes('already been processed') ||
          error.message.includes('This transaction has already been processed')
        )) {
          console.log('Transaction already processed, using existing signature');
          const sig = transaction.signatures[0];
          if (sig && sig.signature) {
            txSignature = bs58.encode(sig.signature);
          } else {
            throw new Error('Cannot extract signature from already processed transaction');
          }
        } else {
          throw new Error(`Transaction submission failed: ${error.message}`);
        }
      }

      // Step 6: Confirm transaction
      const confirmation = await this.confirmTransaction(txSignature);
      if (!confirmation.success) {
        await this.createPaymentRecord({
          userId,
          transactionSignature: txSignature,
          amount: validationResult.amount,
          tokenMint: this.tokenMint,
          senderWallet: validationResult.sender,
          recipientWallet: this.rewardPoolVault,
          endpoint,
          status: 'failed',
          network: this.network
        });

        throw new Error(confirmation.error);
      }

      // Step 7: Verify on-chain token transfer
      const transferVerification = await this.verifyOnChainTransfer(
        txSignature,
        validationResult.sender,
        validationResult.amount
      );

      if (!transferVerification.success) {
        throw new Error(transferVerification.error);
      }

      // Step 8: Create payment record
      const payment = await this.createPaymentRecord({
        userId,
        transactionSignature: txSignature,
        amount: transferVerification.amount,
        tokenMint: this.tokenMint,
        senderWallet: validationResult.sender,
        recipientWallet: this.rewardPoolVault,
        endpoint,
        status: 'confirmed',
        blockTime: transferVerification.blockTime,
        slot: transferVerification.slot,
        network: this.network,
        verifiedAt: new Date()
      });

      return {
        success: true,
        payment,
        message: 'Payment verified and sent to reward pool'
      };

    } catch (error) {
      console.error('Reward pool payment verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validates transaction instructions for SPL token transfer
   */
  validateTransactionInstructions(transaction) {
    try {
      const instructions = transaction.instructions;

      if (!instructions || instructions.length === 0) {
        return { valid: false, error: 'No instructions in transaction' };
      }

      // Look for SPL Token Transfer instruction
      let transferInstruction = null;
      let senderTokenAccount = null;
      let amount = 0;

      for (const instruction of instructions) {
        // Check if this is a token program instruction
        if (instruction.programId.equals(TOKEN_PROGRAM_ID)) {
          // Parse instruction data (first byte is instruction type)
          const instructionData = instruction.data;

          // Type 3 = Transfer instruction in SPL Token program
          if (instructionData[0] === 3) {
            transferInstruction = instruction;

            // Extract amount from instruction data (bytes 1-9 are u64 little-endian)
            amount = Number(instructionData.readBigUInt64LE(1));

            // First account is source token account
            if (instruction.keys.length >= 2) {
              senderTokenAccount = instruction.keys[0].pubkey.toBase58();
            }
            break;
          }
        }
      }

      if (!transferInstruction) {
        return { valid: false, error: 'No SPL token transfer instruction found' };
      }

      // Validate amount
      if (amount < this.requiredAmount) {
        return {
          valid: false,
          error: `Insufficient payment amount. Required: ${this.requiredAmount / 1_000_000} USDC (${this.requiredAmount} lamports), Received: ${amount / 1_000_000} USDC (${amount} lamports)`
        };
      }

      return {
        valid: true,
        amount,
        sender: senderTokenAccount
      };

    } catch (error) {
      return {
        valid: false,
        error: `Transaction validation failed: ${error.message}`
      };
    }
  }

  /**
   * Confirms transaction on blockchain
   */
  async confirmTransaction(signature) {
    try {
      const confirmation = await this.connection.confirmTransaction(
        signature,
        'confirmed'
      );

      if (confirmation.value.err) {
        return {
          success: false,
          error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Confirmation error: ${error.message}`
      };
    }
  }

  /**
   * Verifies the actual token transfer on-chain
   */
  async verifyOnChainTransfer(signature, expectedSender, expectedAmount) {
    try {
      console.log('Fetching transaction from chain:', signature);
      const txDetails = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!txDetails) {
        return {
          success: false,
          error: 'Transaction not found on chain'
        };
      }

      console.log('Transaction found, verifying transfer to reward pool vault');

      // Parse transaction to find token transfer
      const tokenTransfers = this.parseTokenTransfers(txDetails);

      // Find transfer to reward pool vault
      const paymentTransfer = tokenTransfers.find(transfer =>
        transfer.destination === this.rewardPoolVault &&
        transfer.mint === this.tokenMint
      );

      if (!paymentTransfer) {
        console.error('No matching transfer found. Expected:', {
          vault: this.rewardPoolVault,
          mint: this.tokenMint
        });
        console.error('Found transfers:', tokenTransfers);
        return {
          success: false,
          error: 'No matching token transfer to reward pool found'
        };
      }

      if (paymentTransfer.amount < this.requiredAmount) {
        return {
          success: false,
          error: `Insufficient amount transferred. Required: ${this.requiredAmount / 1_000_000} USDC, Got: ${paymentTransfer.amount / 1_000_000} USDC`
        };
      }

      console.log(`✅ Payment to reward pool verified: ${paymentTransfer.amount / 1_000_000} USDC`);

      return {
        success: true,
        amount: paymentTransfer.amount,
        blockTime: txDetails.blockTime,
        slot: txDetails.slot
      };

    } catch (error) {
      console.error('On-chain verification error:', error);
      return {
        success: false,
        error: `On-chain verification failed: ${error.message}`
      };
    }
  }

  /**
   * Parses token transfers from transaction details
   */
  parseTokenTransfers(txDetails) {
    const transfers = [];

    try {
      if (txDetails.meta && txDetails.meta.postTokenBalances && txDetails.meta.preTokenBalances) {
        const preBalances = txDetails.meta.preTokenBalances;
        const postBalances = txDetails.meta.postTokenBalances;

        const accountMap = new Map();

        preBalances.forEach(pre => {
          accountMap.set(pre.accountIndex, {
            pre: Number(pre.uiTokenAmount.amount),
            post: 0,
            owner: pre.owner,
            mint: pre.mint,
            accountAddress: txDetails.transaction.message.accountKeys[pre.accountIndex]?.toBase58()
          });
        });

        postBalances.forEach(post => {
          const existing = accountMap.get(post.accountIndex);
          if (existing) {
            existing.post = Number(post.uiTokenAmount.amount);
          } else {
            accountMap.set(post.accountIndex, {
              pre: 0,
              post: Number(post.uiTokenAmount.amount),
              owner: post.owner,
              mint: post.mint,
              accountAddress: txDetails.transaction.message.accountKeys[post.accountIndex]?.toBase58()
            });
          }
        });

        // Find transfers (accounts with increases)
        accountMap.forEach((account) => {
          const diff = account.post - account.pre;

          if (diff > 0) {
            transfers.push({
              destination: account.accountAddress, // Use actual token account address
              mint: account.mint,
              amount: diff
            });
          }
        });
      }
    } catch (error) {
      console.error('Error parsing token transfers:', error);
    }

    return transfers;
  }

  /**
   * Creates or updates payment record in database
   */
  async createPaymentRecord(paymentData) {
    try {
      const payment = await Payment.findOneAndUpdate(
        { transactionSignature: paymentData.transactionSignature },
        paymentData,
        { upsert: true, new: true }
      );

      return payment;
    } catch (error) {
      console.error('Error creating payment record:', error);
      throw error;
    }
  }
}

export default new RewardPoolPaymentController();
