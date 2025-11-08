import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Can be null for anonymous payments
  },
  transactionSignature: {
    type: String,
    required: [true, 'Transaction signature is required'],
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount must be positive']
  },
  tokenMint: {
    type: String,
    required: [true, 'Token mint address is required']
  },
  senderWallet: {
    type: String,
    required: [true, 'Sender wallet is required']
  },
  recipientWallet: {
    type: String,
    required: [true, 'Recipient wallet is required']
  },
  endpoint: {
    type: String,
    required: [true, 'API endpoint is required']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  blockTime: {
    type: Number
  },
  slot: {
    type: Number
  },
  network: {
    type: String,
    enum: ['solana-mainnet', 'solana-devnet', 'solana-testnet'],
    required: [true, 'Network is required']
  },
  x402Version: {
    type: Number,
    default: 1
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  verifiedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for quick lookup by signature and status
paymentSchema.index({ transactionSignature: 1, status: 1 });

// Index for user payment history
paymentSchema.index({ userId: 1, createdAt: -1 });

// Method to check if payment is expired (older than 5 minutes and still pending)
paymentSchema.methods.isExpired = function() {
  if (this.status !== 'pending') return false;
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  return this.createdAt < fiveMinutesAgo;
};

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
