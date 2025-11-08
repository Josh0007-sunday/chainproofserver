// ChainProof Protocol v2 - Complete Anchor Program
// Token Registry + Reward Pool + Staking + User Profiles + Developer Tracking
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("45gVbLLSYYcW254TFoJMXmfupM5dJaFxTLsbny2eqKWx");

// Stake token mint: 2FKjWV4zh7AVsmXonL7AM9Lh9zfpcE3e1dCYejWvd5W8
const STAKE_TOKEN_MINT: &str = "2FKjWV4zh7AVsmXonL7AM9Lh9zfpcE3e1dCYejWvd5W8";
const VERIFICATION_THRESHOLD: u64 = 10; // 10 stakes for verified badge
const UNSTAKE_COOLDOWN: i64 = 172800; // 48 hours in seconds
const DEVELOPER_REFERRAL_CODE: &str = "CHAINPROOFDEV";

#[program]
pub mod chainproof_protocol {
    use super::*;

    // ============================================
    // TOKEN REGISTRY (EXISTING - PRESERVED)
    // ============================================

    pub fn register_token(
        ctx: Context<RegisterToken>,
        name: String,
        symbol: String,
        ipfs_hash: String,
    ) -> Result<()> {
        let token_entry = &mut ctx.accounts.token_entry;
        let clock = Clock::get()?;

        require!(name.len() <= 50, ChainProofError::NameTooLong);
        require!(symbol.len() <= 10, ChainProofError::SymbolTooLong);
        require!(ipfs_hash.len() <= 100, ChainProofError::IpfsHashTooLong);

        token_entry.authority = ctx.accounts.authority.key();
        token_entry.mint = ctx.accounts.mint.key();
        token_entry.name = name;
        token_entry.symbol = symbol;
        token_entry.ipfs_hash = ipfs_hash;
        token_entry.timestamp = clock.unix_timestamp;
        token_entry.bump = ctx.bumps.token_entry;

        emit!(TokenRegistered {
            mint: token_entry.mint,
            authority: token_entry.authority,
            name: token_entry.name.clone(),
            timestamp: token_entry.timestamp,
        });

        Ok(())
    }

    pub fn update_token_entry(
        ctx: Context<UpdateTokenEntry>,
        name: String,
        symbol: String,
        ipfs_hash: String,
    ) -> Result<()> {
        let token_entry = &mut ctx.accounts.token_entry;
        let clock = Clock::get()?;

        require!(name.len() <= 50, ChainProofError::NameTooLong);
        require!(symbol.len() <= 10, ChainProofError::SymbolTooLong);
        require!(ipfs_hash.len() <= 100, ChainProofError::IpfsHashTooLong);

        token_entry.name = name;
        token_entry.symbol = symbol;
        token_entry.ipfs_hash = ipfs_hash;
        token_entry.timestamp = clock.unix_timestamp;

        emit!(TokenUpdated {
            mint: token_entry.mint,
            authority: token_entry.authority,
            name: token_entry.name.clone(),
            timestamp: token_entry.timestamp,
        });

        Ok(())
    }

    // ============================================
    // REWARD POOL
    // ============================================

    pub fn initialize_reward_pool(ctx: Context<InitializeRewardPool>) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;
        let clock = Clock::get()?;

        pool.authority = ctx.accounts.authority.key();
        pool.total_deposited = 0;
        pool.total_distributed = 0;
        pool.last_distribution = clock.unix_timestamp;
        pool.distribution_interval = 604800; // 1 week
        pool.developer_share_bps = 6000; // 60%
        pool.user_share_bps = 4000; // 40%
        pool.bump = ctx.bumps.reward_pool;

        emit!(RewardPoolInitialized {
            authority: pool.authority,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn deposit_to_pool(ctx: Context<DepositToPool>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;

        // Transfer tokens from depositor to pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.pool_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        pool.total_deposited = pool.total_deposited.checked_add(amount).unwrap();

        emit!(PoolDeposit {
            depositor: ctx.accounts.depositor.key(),
            amount,
            total_deposited: pool.total_deposited,
        });

        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;
        let dev_registry = &ctx.accounts.developer_registry;
        let clock = Clock::get()?;

        // Check if enough time has passed since last distribution
        require!(
            clock.unix_timestamp >= pool.last_distribution + pool.distribution_interval,
            ChainProofError::DistributionTooEarly
        );

        // Get available balance
        let available_balance = ctx.accounts.pool_token_account.amount;
        require!(available_balance > 0, ChainProofError::InsufficientPoolBalance);

        // Calculate shares
        let developer_share = (available_balance as u128)
            .checked_mul(pool.developer_share_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;

        let user_share = (available_balance as u128)
            .checked_mul(pool.user_share_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;

        pool.last_distribution = clock.unix_timestamp;
        pool.total_distributed = pool.total_distributed.checked_add(developer_share + user_share).unwrap();

        emit!(RewardsDistributed {
            cycle_timestamp: clock.unix_timestamp,
            developer_share,
            user_share,
            total_developers: dev_registry.total_developers,
        });

        Ok(())
    }

    // ============================================
    // USER PROFILES
    // ============================================

    pub fn create_profile(
        ctx: Context<CreateProfile>,
        username: String,
        referral_code: Option<String>,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        require!(username.len() <= 32, ChainProofError::UsernameTooLong);
        require!(username.len() >= 3, ChainProofError::UsernameTooShort);

        profile.wallet = ctx.accounts.user.key();
        profile.username = username;
        profile.referral_code = referral_code.clone();
        profile.is_developer = referral_code.as_deref() == Some(DEVELOPER_REFERRAL_CODE);
        profile.total_stakes = 0;
        profile.reward_points = 0;
        profile.created_at = clock.unix_timestamp;
        profile.bump = ctx.bumps.user_profile;

        emit!(ProfileCreated {
            wallet: profile.wallet,
            username: profile.username.clone(),
            is_developer: profile.is_developer,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        username: String,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;

        require!(username.len() <= 32, ChainProofError::UsernameTooLong);
        require!(username.len() >= 3, ChainProofError::UsernameTooShort);

        profile.username = username;

        emit!(ProfileUpdated {
            wallet: profile.wallet,
            username: profile.username.clone(),
        });

        Ok(())
    }

    // ============================================
    // DEVELOPER REGISTRY
    // ============================================

    pub fn initialize_developer_registry(ctx: Context<InitializeDeveloperRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.developer_registry;

        registry.authority = ctx.accounts.authority.key();
        registry.total_developers = 0;
        registry.bump = ctx.bumps.developer_registry;

        emit!(DeveloperRegistryInitialized {
            authority: registry.authority,
        });

        Ok(())
    }

    pub fn register_developer(ctx: Context<RegisterDeveloper>) -> Result<()> {
        let registry = &mut ctx.accounts.developer_registry;
        let profile = &ctx.accounts.user_profile;

        require!(profile.is_developer, ChainProofError::NotADeveloper);

        registry.total_developers = registry.total_developers.checked_add(1).unwrap();

        emit!(DeveloperRegistered {
            wallet: profile.wallet,
            total_developers: registry.total_developers,
        });

        Ok(())
    }

    // ============================================
    // STAKING SYSTEM
    // ============================================

    pub fn stake_on_project(
        ctx: Context<StakeOnProject>,
        amount: u64,
    ) -> Result<()> {
        let project_stakes = &mut ctx.accounts.project_stakes;
        let user_stake = &mut ctx.accounts.user_stake;
        let user_profile = &mut ctx.accounts.user_profile;
        let clock = Clock::get()?;

        require!(amount > 0, ChainProofError::InvalidStakeAmount);

        // Transfer stake tokens from user to stake vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.stake_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Initialize or update user stake
        user_stake.user = ctx.accounts.user.key();
        user_stake.project_mint = ctx.accounts.project_mint.key();
        user_stake.amount = user_stake.amount.checked_add(amount).unwrap();
        user_stake.staked_at = clock.unix_timestamp;
        user_stake.unstake_requested_at = None;
        user_stake.bump = ctx.bumps.user_stake;

        // Update project stakes
        project_stakes.total_stakes = project_stakes.total_stakes.checked_add(1).unwrap();

        // Check for verification
        if project_stakes.total_stakes >= VERIFICATION_THRESHOLD && !project_stakes.is_verified {
            project_stakes.is_verified = true;
            emit!(ProjectVerified {
                project_mint: project_stakes.project_mint,
                total_stakes: project_stakes.total_stakes,
            });
        }

        // Update user profile
        user_profile.total_stakes = user_profile.total_stakes.checked_add(1).unwrap();
        user_profile.reward_points = user_profile.reward_points.checked_add(amount).unwrap();

        emit!(Staked {
            user: ctx.accounts.user.key(),
            project_mint: ctx.accounts.project_mint.key(),
            amount,
            total_stakes: project_stakes.total_stakes,
        });

        Ok(())
    }

    pub fn initialize_project_stakes(ctx: Context<InitializeProjectStakes>) -> Result<()> {
        let project_stakes = &mut ctx.accounts.project_stakes;

        project_stakes.project_mint = ctx.accounts.project_mint.key();
        project_stakes.total_stakes = 0;
        project_stakes.is_verified = false;
        project_stakes.bump = ctx.bumps.project_stakes;

        Ok(())
    }

    pub fn request_unstake(ctx: Context<RequestUnstake>) -> Result<()> {
        let user_stake = &mut ctx.accounts.user_stake;
        let clock = Clock::get()?;

        require!(user_stake.amount > 0, ChainProofError::NoStakeFound);
        require!(
            user_stake.unstake_requested_at.is_none(),
            ChainProofError::UnstakeAlreadyRequested
        );

        user_stake.unstake_requested_at = Some(clock.unix_timestamp);

        emit!(UnstakeRequested {
            user: user_stake.user,
            project_mint: user_stake.project_mint,
            cooldown_ends: clock.unix_timestamp + UNSTAKE_COOLDOWN,
        });

        Ok(())
    }

    pub fn complete_unstake(ctx: Context<CompleteUnstake>) -> Result<()> {
        let user_stake = &mut ctx.accounts.user_stake;
        let clock = Clock::get()?;

        // Check cooldown period
        let requested_at = user_stake.unstake_requested_at.ok_or(ChainProofError::UnstakeNotRequested)?;
        require!(
            clock.unix_timestamp >= requested_at + UNSTAKE_COOLDOWN,
            ChainProofError::CooldownNotComplete
        );

        let amount = user_stake.amount;

        // Store bump before borrowing project_stakes mutably
        let project_stakes_bump = ctx.accounts.project_stakes.bump;
        let project_mint_key = ctx.accounts.project_mint.key();

        // Transfer stake tokens back to user
        let seeds = &[
            b"stake_vault",
            project_mint_key.as_ref(),
            &[project_stakes_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.stake_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.project_stakes.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        // Now update counts (after CPI is complete)
        let project_stakes = &mut ctx.accounts.project_stakes;
        let user_profile = &mut ctx.accounts.user_profile;

        project_stakes.total_stakes = project_stakes.total_stakes.saturating_sub(1);
        user_profile.total_stakes = user_profile.total_stakes.saturating_sub(1);
        user_profile.reward_points = user_profile.reward_points.saturating_sub(amount);

        // Check if project loses verification
        if project_stakes.total_stakes < VERIFICATION_THRESHOLD && project_stakes.is_verified {
            project_stakes.is_verified = false;
        }

        // Reset user stake
        user_stake.amount = 0;
        user_stake.unstake_requested_at = None;

        emit!(Unstaked {
            user: user_stake.user,
            project_mint: user_stake.project_mint,
            amount,
        });

        Ok(())
    }
}

// ============================================
// ACCOUNT STRUCTS
// ============================================

#[account]
pub struct TokenEntry {
    pub authority: Pubkey,  // 32
    pub mint: Pubkey,       // 32
    pub name: String,       // 4 + 50
    pub symbol: String,     // 4 + 10
    pub ipfs_hash: String,  // 4 + 100
    pub timestamp: i64,     // 8
    pub bump: u8,           // 1
}

impl TokenEntry {
    pub const LEN: usize = 8 + 32 + 32 + (4 + 50) + (4 + 10) + (4 + 100) + 8 + 1;
}

#[account]
pub struct RewardPool {
    pub authority: Pubkey,          // 32
    pub total_deposited: u64,       // 8
    pub total_distributed: u64,     // 8
    pub last_distribution: i64,     // 8
    pub distribution_interval: i64, // 8
    pub developer_share_bps: u16,   // 2 (basis points: 6000 = 60%)
    pub user_share_bps: u16,        // 2
    pub bump: u8,                   // 1
}

impl RewardPool {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 2 + 2 + 1;
}

#[account]
pub struct UserProfile {
    pub wallet: Pubkey,             // 32
    pub username: String,           // 4 + 32
    pub referral_code: Option<String>, // 1 + 4 + 32
    pub is_developer: bool,         // 1
    pub total_stakes: u64,          // 8
    pub reward_points: u64,         // 8
    pub created_at: i64,            // 8
    pub bump: u8,                   // 1
}

impl UserProfile {
    pub const LEN: usize = 8 + 32 + (4 + 32) + (1 + 4 + 32) + 1 + 8 + 8 + 8 + 1;
}

#[account]
pub struct DeveloperRegistry {
    pub authority: Pubkey,          // 32
    pub total_developers: u64,      // 8
    pub bump: u8,                   // 1
}

impl DeveloperRegistry {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct ProjectStakes {
    pub project_mint: Pubkey,       // 32
    pub total_stakes: u64,          // 8
    pub is_verified: bool,          // 1
    pub bump: u8,                   // 1
}

impl ProjectStakes {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 1;
}

#[account]
pub struct UserStake {
    pub user: Pubkey,               // 32
    pub project_mint: Pubkey,       // 32
    pub amount: u64,                // 8
    pub staked_at: i64,             // 8
    pub unstake_requested_at: Option<i64>, // 1 + 8
    pub bump: u8,                   // 1
}

impl UserStake {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + (1 + 8) + 1;
}

// ============================================
// CONTEXTS
// ============================================

#[derive(Accounts)]
#[instruction(name: String, symbol: String, ipfs_hash: String)]
pub struct RegisterToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Token mint being registered
    pub mint: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = TokenEntry::LEN,
        seeds = [b"token_entry", mint.key().as_ref()],
        bump
    )]
    pub token_entry: Account<'info, TokenEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTokenEntry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"token_entry", token_entry.mint.key().as_ref()],
        bump = token_entry.bump
    )]
    pub token_entry: Account<'info, TokenEntry>,
}

#[derive(Accounts)]
pub struct InitializeRewardPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = RewardPool::LEN,
        seeds = [b"reward_pool"],
        bump
    )]
    pub reward_pool: Account<'info, RewardPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToPool<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut, has_one = authority)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub developer_registry: Account<'info, DeveloperRegistry>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(username: String, referral_code: Option<String>)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = UserProfile::LEN,
        seeds = [b"user_profile", user.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump,
        has_one = wallet
    )]
    pub user_profile: Account<'info, UserProfile>,

    /// CHECK: Checked via has_one constraint
    pub wallet: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeDeveloperRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = DeveloperRegistry::LEN,
        seeds = [b"developer_registry"],
        bump
    )]
    pub developer_registry: Account<'info, DeveloperRegistry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterDeveloper<'info> {
    #[account(mut)]
    pub developer_registry: Account<'info, DeveloperRegistry>,

    pub user_profile: Account<'info, UserProfile>,
}

#[derive(Accounts)]
pub struct InitializeProjectStakes<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Token mint being staked on
    pub project_mint: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = ProjectStakes::LEN,
        seeds = [b"project_stakes", project_mint.key().as_ref()],
        bump
    )]
    pub project_stakes: Account<'info, ProjectStakes>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeOnProject<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Token mint being staked on
    pub project_mint: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserStake::LEN,
        seeds = [b"user_stake", user.key().as_ref(), project_mint.key().as_ref()],
        bump
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [b"project_stakes", project_mint.key().as_ref()],
        bump = project_stakes.bump
    )]
    pub project_stakes: Account<'info, ProjectStakes>,

    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_stake", user.key().as_ref(), user_stake.project_mint.key().as_ref()],
        bump = user_stake.bump,
        has_one = user
    )]
    pub user_stake: Account<'info, UserStake>,
}

#[derive(Accounts)]
pub struct CompleteUnstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Project mint
    pub project_mint: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"user_stake", user.key().as_ref(), project_mint.key().as_ref()],
        bump = user_stake.bump,
        has_one = user
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [b"project_stakes", project_mint.key().as_ref()],
        bump = project_stakes.bump
    )]
    pub project_stakes: Account<'info, ProjectStakes>,

    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ============================================
// EVENTS
// ============================================

#[event]
pub struct TokenRegistered {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct TokenUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct RewardPoolInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PoolDeposit {
    pub depositor: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}

#[event]
pub struct RewardsDistributed {
    pub cycle_timestamp: i64,
    pub developer_share: u64,
    pub user_share: u64,
    pub total_developers: u64,
}

#[event]
pub struct ProfileCreated {
    pub wallet: Pubkey,
    pub username: String,
    pub is_developer: bool,
    pub timestamp: i64,
}

#[event]
pub struct ProfileUpdated {
    pub wallet: Pubkey,
    pub username: String,
}

#[event]
pub struct DeveloperRegistryInitialized {
    pub authority: Pubkey,
}

#[event]
pub struct DeveloperRegistered {
    pub wallet: Pubkey,
    pub total_developers: u64,
}

#[event]
pub struct Staked {
    pub user: Pubkey,
    pub project_mint: Pubkey,
    pub amount: u64,
    pub total_stakes: u64,
}

#[event]
pub struct ProjectVerified {
    pub project_mint: Pubkey,
    pub total_stakes: u64,
}

#[event]
pub struct UnstakeRequested {
    pub user: Pubkey,
    pub project_mint: Pubkey,
    pub cooldown_ends: i64,
}

#[event]
pub struct Unstaked {
    pub user: Pubkey,
    pub project_mint: Pubkey,
    pub amount: u64,
}

// ============================================
// ERRORS
// ============================================

#[error_code]
pub enum ChainProofError {
    #[msg("Name too long (max 50 characters)")]
    NameTooLong,
    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,
    #[msg("IPFS hash too long (max 100 characters)")]
    IpfsHashTooLong,
    #[msg("Username too long (max 32 characters)")]
    UsernameTooLong,
    #[msg("Username too short (min 3 characters)")]
    UsernameTooShort,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Not a developer (must use CHAINPROOFDEV referral code)")]
    NotADeveloper,
    #[msg("Invalid stake amount")]
    InvalidStakeAmount,
    #[msg("No stake found")]
    NoStakeFound,
    #[msg("Unstake already requested")]
    UnstakeAlreadyRequested,
    #[msg("Unstake not requested yet")]
    UnstakeNotRequested,
    #[msg("Cooldown period not complete (48 hours required)")]
    CooldownNotComplete,
    #[msg("Distribution too early (must wait for interval)")]
    DistributionTooEarly,
    #[msg("Insufficient pool balance")]
    InsufficientPoolBalance,
}
