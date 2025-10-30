import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'API key name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date
  },
  usageCount: {
    type: Number,
    default: 0
  },
  permissions: {
    analyze: { type: Boolean, default: true },
    riskScore: { type: Boolean, default: true },
    fullAnalysis: { type: Boolean, default: true },
    batch: { type: Boolean, default: true },
    registration: { type: Boolean, default: true }
  },
  rateLimit: {
    requestsPerMinute: {
      type: Number,
      default: 60
    },
    requestsPerDay: {
      type: Number,
      default: 10000
    }
  },
  expiresAt: {
    type: Date,
    default: null // null means no expiration
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate a unique API key
apiKeySchema.statics.generateKey = function() {
  const prefix = 'cp'; // ChainProof prefix
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
};

// Method to check if key is expired
apiKeySchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to update usage statistics
apiKeySchema.methods.recordUsage = async function() {
  this.lastUsed = new Date();
  this.usageCount += 1;
  await this.save();
};

// Don't return full key in JSON responses (only show last 8 chars)
apiKeySchema.methods.toJSON = function() {
  const apiKey = this.toObject();
  if (apiKey.key) {
    apiKey.keyPreview = `...${apiKey.key.slice(-8)}`;
    delete apiKey.key;
  }
  return apiKey;
};

const APIKey = mongoose.model('APIKey', apiKeySchema);

export default APIKey;
