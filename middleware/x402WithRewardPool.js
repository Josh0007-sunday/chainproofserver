import rewardPoolPaymentController from '../controllers/rewardPoolPaymentController.js';

/**
 * Middleware that verifies x402 payment directly to reward pool
 * This is specifically for public API endpoints that should contribute to the protocol
 * Payment goes DIRECTLY to the reward pool vault, not through an intermediary
 */
export const verifyX402WithRewardPool = async (req, res, next) => {
  try {
    // Check if x402 is enabled
    const x402Enabled = process.env.X402_ENABLED === 'true';

    if (!x402Enabled) {
      // x402 not enabled, skip payment verification
      return next();
    }

    // Check for X-PAYMENT header
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // No payment provided, return 402 Payment Required with reward pool details
      const paymentRequirements = rewardPoolPaymentController.getPaymentRequirements();

      return res.status(402).json({
        success: false,
        error: 'Payment required',
        paymentRequired: true,
        x402: {
          version: 1,
          recipient: paymentRequirements.recipient,
          amount: paymentRequirements.amount,
          token: paymentRequirements.token,
          network: paymentRequirements.network,
          message: 'This endpoint requires payment. 0.1 USDC goes directly to the ChainProof reward pool.'
        }
      });
    }

    // Parse payment header
    let paymentData;
    try {
      paymentData = JSON.parse(paymentHeader);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid X-PAYMENT header format. Expected JSON.'
      });
    }

    // Validate payment data structure
    if (!paymentData.x402Version || !paymentData.scheme || !paymentData.network || !paymentData.payload) {
      return res.status(400).json({
        success: false,
        error: 'Invalid x402 payment structure. Missing required fields.'
      });
    }

    if (!paymentData.payload.serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serialized transaction in payment payload.'
      });
    }

    // Verify the payment using reward pool controller
    const endpoint = req.originalUrl || req.url;
    const userId = req.user?._id || null;

    const verificationResult = await rewardPoolPaymentController.verifyPayment(
      paymentData.payload.serializedTransaction,
      endpoint,
      userId
    );

    if (!verificationResult.success) {
      return res.status(402).json({
        success: false,
        error: 'Payment verification failed',
        details: verificationResult.error,
        paymentRequired: true
      });
    }

    // Attach payment info to request
    req.payment = {
      ...verificationResult.payment,
      verified: true
    };

    console.log(`✅ x402 payment verified - 0.1 USDC sent to reward pool`);

    // Continue to the route handler
    next();
  } catch (error) {
    console.error('x402 reward pool payment verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during payment verification.'
    });
  }
};
