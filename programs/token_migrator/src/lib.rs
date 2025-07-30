//! A program to migrate by receiving META and then distributing the new TOKEN

#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};

declare_id!("tknMiQZDHrrJe4VDESf3cJorj1jWCfCYK2g4d7nqjT1");

// Hard-coded constants as per requirements
pub const OLD_TOKEN_DECIMALS: u8 = 9;
pub const NEW_TOKEN_DECIMALS: u8 = 6;
pub const RATIO: u64 = 1000; // 1:1000 ratio
pub const OLD_TOKEN_MINT: Pubkey = Pubkey::from_str_const("METADDFL6wWMWEoKTFJwcThTbUmtarRJZjRpzUvkxhr");
pub const NEW_TOKEN_MINT: Pubkey = Pubkey::from_str_const("METADDFL6wWMWEoKTFJwcThTbUmtarRJZjRpzUvkxhr");

// Total supply amounts (with their respective decimals)
pub const EXISTING_TOKEN_AMOUNT: u64 = 20_865_909_205_593; // 9 decimals
pub const NEW_TOKEN_AMOUNT: u64 = 20_865_909_205_593; // 6 decimals

#[program]
pub mod token_migrator {
    use super::*;

    /// Initialize the token migrator
    pub fn initialize_migrator(ctx: Context<InitializeMigrator>) -> Result<()> {
        let migrator = &mut ctx.accounts.migrator;
        
        migrator.status = MigratorStatus::Active;
        migrator.pda_bump = ctx.bumps.migrator;
        migrator.seq_num = 0;
        migrator.old_token_mint = OLD_TOKEN_MINT;
        migrator.new_token_mint = NEW_TOKEN_MINT;
        migrator.old_token_account = ctx.accounts.migrator_old_token_account.key();
        migrator.new_token_account = ctx.accounts.migrator_new_token_account.key();
        migrator.old_token_amount = EXISTING_TOKEN_AMOUNT;
        migrator.new_token_amount = NEW_TOKEN_AMOUNT;
        migrator.ratio = RATIO as u8;
        
        Ok(())
    }

    /// Migrate old tokens to new tokens
    pub fn migrate(ctx: Context<Migrate>, amount: u64) -> Result<()> {
        // Validate input amount
        require_gt!(amount, 0, TokenMigratorError::InvalidAmount);
        
        // Confirm we're only accepting the correct token
        require_eq!(ctx.accounts.from.mint, OLD_TOKEN_MINT, TokenMigratorError::InvalidOldToken);
        
        // Check user has sufficient balance
        require_gte!(ctx.accounts.from.amount, amount, TokenMigratorError::InsufficientBalance);
        
        // Validate migrator account
        let migrator = &ctx.accounts.migrator;
        require_eq!(migrator.status, MigratorStatus::Active, TokenMigratorError::MigratorNotActive);
        require_eq!(migrator.old_token_mint, OLD_TOKEN_MINT, TokenMigratorError::InvalidMigratorOldToken);
        require_eq!(migrator.new_token_mint, NEW_TOKEN_MINT, TokenMigratorError::InvalidMigratorNewToken);
        
        // Check migrator has sufficient new tokens
        require_gte!(ctx.accounts.migrator_new_token_account.amount, calculate_new_token_amount(amount)?, TokenMigratorError::InsufficientMigratorBalance);
        
        // Calculate new token amount with overflow protection
        let new_token_amount = calculate_new_token_amount(amount)?;
        
        // Transfer old tokens from user to migrator
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.migrator_old_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        // Transfer new tokens from migrator to user
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.migrator_new_token_account.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.migrator.to_account_info(),
                },
            ),
            new_token_amount,
        )?;

        // Update sequence number
        let migrator = &mut ctx.accounts.migrator;
        migrator.seq_num = migrator.seq_num.checked_add(1).unwrap();

        Ok(())
    }
}

/// Calculate new token amount based on ratio and decimals
fn calculate_new_token_amount(old_amount: u64) -> Result<u64> {
    // Convert to u128 for safe arithmetic
    let old_amount_u128 = old_amount as u128;
    let ratio_u128 = RATIO as u128;
    
    // Calculate: new_amount = old_amount * ratio * (10^new_decimals) / (10^old_decimals)
    // This accounts for the decimal difference between tokens
    // Since NEW_TOKEN_DECIMALS < OLD_TOKEN_DECIMALS, we divide by the difference
    let decimal_adjustment = 10u128.pow((OLD_TOKEN_DECIMALS - NEW_TOKEN_DECIMALS) as u32);
    
    let new_amount_u128 = old_amount_u128
        .checked_mul(ratio_u128)
        .ok_or(TokenMigratorError::Overflow)?
        .checked_div(decimal_adjustment)
        .ok_or(TokenMigratorError::Overflow)?;
    
    // Convert back to u64
    let new_amount = u64::try_from(new_amount_u128)
        .map_err(|_| TokenMigratorError::Overflow)?;
    
    Ok(new_amount)
}

#[derive(Accounts)]
pub struct InitializeMigrator<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TokenMigrator::INIT_SPACE,
        seeds = [
            b"token_migrator",
            OLD_TOKEN_MINT.as_ref(),
            NEW_TOKEN_MINT.as_ref()
        ],
        bump
    )]
    pub migrator: Account<'info, TokenMigrator>,
    
    #[account(
        mut,
        constraint = migrator_old_token_account.mint == OLD_TOKEN_MINT @ TokenMigratorError::InvalidOldTokenAccount
    )]
    pub migrator_old_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = migrator_new_token_account.mint == NEW_TOKEN_MINT @ TokenMigratorError::InvalidNewTokenAccount
    )]
    pub migrator_new_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Migrate<'info> {
    #[account(
        mut,
        seeds = [
            b"token_migrator",
            OLD_TOKEN_MINT.as_ref(),
            NEW_TOKEN_MINT.as_ref()
        ],
        bump = migrator.pda_bump,
        constraint = migrator.status == MigratorStatus::Active @ TokenMigratorError::MigratorNotActive
    )]
    pub migrator: Account<'info, TokenMigrator>,
    
    pub token_program: Program<'info, Token>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = from.mint == OLD_TOKEN_MINT @ TokenMigratorError::InvalidOldToken,
        constraint = from.owner == authority.key() @ TokenMigratorError::InvalidAuthority
    )]
    pub from: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = to.mint == NEW_TOKEN_MINT @ TokenMigratorError::InvalidNewToken,
        constraint = to.owner == authority.key() @ TokenMigratorError::InvalidAuthority
    )]
    pub to: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = migrator_old_token_account.key() == migrator.old_token_account @ TokenMigratorError::InvalidMigratorOldTokenAccount
    )]
    pub migrator_old_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = migrator_new_token_account.key() == migrator.new_token_account @ TokenMigratorError::InvalidMigratorNewTokenAccount
    )]
    pub migrator_new_token_account: Account<'info, TokenAccount>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MigratorStatus {
    Initialized,
    Active,
    Paused,
}

impl std::fmt::Display for MigratorStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MigratorStatus::Initialized => write!(f, "Initialized"),
            MigratorStatus::Active => write!(f, "Active"),
            MigratorStatus::Paused => write!(f, "Paused"),
        }
    }
}

impl anchor_lang::Space for MigratorStatus {
    const INIT_SPACE: usize = 1; // 1 byte for enum discriminant
}

#[account]
#[derive(InitSpace)]
pub struct TokenMigrator {
    pub status: MigratorStatus,
    pub pda_bump: u8,
    pub seq_num: u64,
    pub old_token_mint: Pubkey,
    pub new_token_mint: Pubkey,
    pub old_token_account: Pubkey,
    pub new_token_account: Pubkey,
    pub old_token_amount: u64,
    pub new_token_amount: u64,
    pub ratio: u8,
}

#[error_code]
pub enum TokenMigratorError {
    #[msg("Invalid amount - must be greater than 0")]
    InvalidAmount,
    #[msg("Invalid old token mint")]
    InvalidOldToken,
    #[msg("Invalid new token mint")]
    InvalidNewToken,
    #[msg("Invalid old token account")]
    InvalidOldTokenAccount,
    #[msg("Invalid new token account")]
    InvalidNewTokenAccount,
    #[msg("Invalid migrator old token account")]
    InvalidMigratorOldTokenAccount,
    #[msg("Invalid migrator new token account")]
    InvalidMigratorNewTokenAccount,
    #[msg("Invalid migrator old token")]
    InvalidMigratorOldToken,
    #[msg("Invalid migrator new token")]
    InvalidMigratorNewToken,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Insufficient migrator balance")]
    InsufficientMigratorBalance,
    #[msg("Migrator not active")]
    MigratorNotActive,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Assertion failed")]
    AssertFailed,
}
