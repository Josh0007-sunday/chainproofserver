import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const PROGRAM_ID = new PublicKey('D6yD4d3ZEGxpdgbFHWTwMSpr9iGrnapLK5QCLvehoiDr');
const STAKE_TOKEN_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

const [rewardPoolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('reward_pool')],
  PROGRAM_ID
);

const poolVault = await getAssociatedTokenAddress(
  STAKE_TOKEN_MINT,
  rewardPoolPda,
  true
);

console.log('Reward Pool PDA:', rewardPoolPda.toBase58());
console.log('Pool Vault:', poolVault.toBase58());

// Check if vault exists
const vaultInfo = await connection.getAccountInfo(poolVault);
console.log('Vault exists:', vaultInfo !== null);

if (vaultInfo) {
  console.log('Vault owner:', vaultInfo.owner.toBase58());
}
