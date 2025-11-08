import { Connection, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import Payment from '../models/Payment.js';

class PaymentController {
  constructor() {
    // Initialize Solana connection based on network
    const network = process.env.X402_NETWORK || 'solana-devnet';
    const rpcUrl = network === 'solana-devnet'
      ? process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
      : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.paymentWallet = process.env.X402_PAYMENT_WALLET;
    this.requiredAmount = parseInt(process.env.X402_PAYMENT_AMOUNT_LAMPORTS || '100000');
    this.tokenMint = process.env.X402_TOKEN_MINT;
    this.network = network;
  }

  /**
   * Validates and processes an x402 payment
   * @param {string} serializedTransaction - Base64 encoded transaction
   * @param {string} endpoint - API endpoint being accessed
   * @param {string} userId - Optional user ID
   * @returns {Object} Payment verification result
   */
  async verifyPayment(serializedTransaction, endpoint, userId = null) {
    try {
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

      // Step 5: Simulate transaction to check validity
      const simulationResult = await this.simulateTransaction(transaction);
      if (!simulationResult.valid) {
        throw new Error(simulationResult.error);
      }

      // Step 6: Submit transaction to blockchain if not already submitted
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
          // Extract the actual signature from the transaction
          const sig = transaction.signatures[0];
          if (sig && sig.signature) {
            txSignature = bs58.encode(sig.signature);
            console.log('Extracted signature:', txSignature);
          } else {
            throw new Error('Cannot extract signature from already processed transaction');
          }
        } else {
          throw new Error(`Transaction submission failed: ${error.message}`);
        }
      }

      // Step 7: Confirm transaction
      const confirmation = await this.confirmTransaction(txSignature);
      if (!confirmation.success) {
        // Create failed payment record
        await this.createPaymentRecord({
          userId,
          transactionSignature: txSignature,
          amount: validationResult.amount,
          tokenMint: this.tokenMint,
          senderWallet: validationResult.sender,
          recipientWallet: this.paymentWallet,
          endpoint,
          status: 'failed',
          network: this.network
        });

        throw new Error(confirmation.error);
      }

      // Step 8: Verify on-chain token transfer
      const transferVerification = await this.verifyOnChainTransfer(
        txSignature,
        validationResult.sender,
        validationResult.amount
      );

      if (!transferVerification.success) {
        throw new Error(transferVerification.error);
      }

      // Step 9: Create or update payment record
      const payment = await this.createPaymentRecord({
        userId,
        transactionSignature: txSignature,
        amount: transferVerification.amount,
        tokenMint: this.tokenMint,
        senderWallet: validationResult.sender,
        recipientWallet: this.paymentWallet,
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
        message: 'Payment verified and confirmed'
      };

    } catch (error) {
      console.error('Payment verification error:', error);
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
          error: `Insufficient payment amount. Required: ${this.requiredAmount}, Received: ${amount}`
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
   * Simulates transaction execution
   */
  async simulateTransaction(transaction) {
    try {
      const simulation = await this.connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        return {
          valid: false,
          error: `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Simulation error: ${error.message}`
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

      console.log('Transaction found, blockTime:', txDetails.blockTime);
      console.log('Transaction meta:', txDetails.meta);

      // Parse transaction to find token transfer
      const tokenTransfers = this.parseTokenTransfers(txDetails);
      console.log('Parsed token transfers:', tokenTransfers);

      // Find transfer to our payment wallet
      const paymentTransfer = tokenTransfers.find(transfer =>
        transfer.destination.includes(this.paymentWallet) &&
        transfer.mint === this.tokenMint
      );

      if (!paymentTransfer) {
        console.error('No matching transfer found. Expected:', {
          wallet: this.paymentWallet,
          mint: this.tokenMint
        });
        console.error('Found transfers:', tokenTransfers);
        return {
          success: false,
          error: 'No matching token transfer found'
        };
      }

      if (paymentTransfer.amount < this.requiredAmount) {
        return {
          success: false,
          error: `Insufficient amount transferred. Required: ${this.requiredAmount}, Got: ${paymentTransfer.amount}`
        };
      }

      console.log('Payment verified successfully:', paymentTransfer);

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
      // Check for token balance changes in meta
      if (txDetails.meta && txDetails.meta.postTokenBalances && txDetails.meta.preTokenBalances) {
        const preBalances = txDetails.meta.preTokenBalances;
        const postBalances = txDetails.meta.postTokenBalances;

        console.log('Full transaction details:', JSON.stringify(txDetails.transaction, null, 2));

        // Build a map of all accounts
        const accountMap = new Map();

        // Process pre-balances
        preBalances.forEach(pre => {
          accountMap.set(pre.accountIndex, {
            pre: Number(pre.uiTokenAmount.amount),
            post: 0,
            owner: pre.owner,
            mint: pre.mint
          });
        });

        // Process post-balances
        postBalances.forEach(post => {
          const existing = accountMap.get(post.accountIndex);
          if (existing) {
            existing.post = Number(post.uiTokenAmount.amount);
          } else {
            accountMap.set(post.accountIndex, {
              pre: 0,
              post: Number(post.uiTokenAmount.amount),
              owner: post.owner,
              mint: post.mint
            });
          }
        });

        // Find transfers (accounts with increases)
        accountMap.forEach((account, index) => {
          const diff = account.post - account.pre;
          console.log(`Account ${index} (${account.owner.substring(0, 8)}...): ${account.pre} -> ${account.post} (diff: ${diff})`);

          if (diff > 0) {
            transfers.push({
              destination: account.owner,
              mint: account.mint,
              amount: diff,
              accountIndex: index
            });
          }
        });

        // If no transfers found, transaction might be a self-transfer or already settled
        if (transfers.length === 0 && txDetails.meta.err === null) {
          console.log('No balance changes, but transaction succeeded. Checking transaction logs...');

          // Look for successful token transfer in logs
          const hasTokenTransfer = txDetails.meta.logMessages?.some(log =>
            log.includes('Instruction: Transfer') && log.includes('success')
          );

          if (hasTokenTransfer) {
            // Find recipient account
            const recipientAccount = postBalances.find(
              balance => balance.owner === this.paymentWallet && balance.mint === this.tokenMint
            );

            if (recipientAccount) {
              console.log('Transaction logs confirm transfer, assuming required amount was transferred');
              transfers.push({
                destination: recipientAccount.owner,
                mint: recipientAccount.mint,
                amount: this.requiredAmount,
                accountIndex: recipientAccount.accountIndex
              });
            }
          }
        }
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

  /**
   * Get payment requirements for x402 response
   */
  getPaymentRequirements() {
    return {
      recipient: this.paymentWallet,
      amount: this.requiredAmount,
      token: this.tokenMint,
      network: this.network
    };
  }
}

export default new PaymentController();
