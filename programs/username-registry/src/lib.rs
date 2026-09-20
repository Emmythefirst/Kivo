use anchor_lang::prelude::*;

declare_id!("AaVd1D36aZWEVQVRr6EHsF9fxShv5MXVo2b3AXDaodSF");

pub const USERNAME_MAX_LEN: usize = 20;
pub const REQUEST_ID_MAX_LEN: usize = 32;
// Mirrors REQUEST_TTL_MS in src/lib/requests.ts — keep both in sync if
// either changes. Client and chain need to agree on what "expired" means,
// or a request could still look valid client-side after the chain has
// already started rejecting it, or vice versa.
pub const REQUEST_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;

#[program]
pub mod username_registry {
    use super::*;

    /// Claims a username. The account address is derived from the name
    /// itself, so uniqueness is enforced by the runtime — a second claim on
    /// the same name fails because the account already exists. No admin, no
    /// database, nobody to arbitrate.
    pub fn claim(ctx: Context<Claim>, username: String) -> Result<()> {
        require!(
            username.len() >= 3 && username.len() <= USERNAME_MAX_LEN,
            RegistryError::BadLength
        );
        require!(
            username
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'),
            RegistryError::BadCharacters
        );

        let record = &mut ctx.accounts.record;
        record.owner = ctx.accounts.owner.key();
        record.username = username;
        record.claimed_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Points an existing username at a different wallet. Only the current
    /// owner can do this, so a name can follow someone to a new device
    /// without being stealable.
    pub fn update_owner(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        ctx.accounts.record.owner = new_owner;
        Ok(())
    }

    /// Releases the name and returns the rent. Frees it for anyone else.
    pub fn release(_ctx: Context<Release>) -> Result<()> {
        Ok(())
    }

    /// Replay protection for payment request links, and nothing else —
    /// no transfer logic lives here. Call this in the *same transaction*
    /// as the actual SOL/USDC transfer instructions (plain System/Token
    /// Program instructions, built client-side exactly as they already
    /// are). Since a Solana transaction is all-or-nothing, creating this
    /// marker account and executing the transfer either both happen or
    /// neither does.
    ///
    /// The marker's address is a PDA derived from the request's id, and
    /// it holds no data — its mere existence is the receipt. A second
    /// attempt to pay the same request tries to `init` the same address
    /// again, which the runtime itself refuses because the account
    /// already exists. That's the entire mechanism: enforced by Solana,
    /// not by app logic a client could skip.
    ///
    /// `created_at` is the request's creation time in Unix seconds (as
    /// embedded in the link, converted from the client's millisecond
    /// timestamp) — checked against the same TTL the client already
    /// enforces, so expiry has the same "chain enforces it" property as
    /// replay protection, instead of being a client-side-only check
    /// someone could bypass by talking to the chain directly.
    pub fn mark_paid(_ctx: Context<MarkPaid>, request_id: String, created_at: i64) -> Result<()> {
        require!(
            !request_id.is_empty() && request_id.len() <= REQUEST_ID_MAX_LEN,
            RegistryError::BadRequestId
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            now <= created_at.saturating_add(REQUEST_TTL_SECONDS),
            RegistryError::RequestExpired
        );

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct Claim<'info> {
    #[account(
        init,
        payer = owner,
        space = UsernameRecord::SPACE,
        seeds = [b"username", username.as_bytes()],
        bump
    )]
    pub record: Account<'info, UsernameRecord>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut, has_one = owner)]
    pub record: Account<'info, UsernameRecord>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut, has_one = owner, close = owner)]
    pub record: Account<'info, UsernameRecord>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(request_id: String)]
pub struct MarkPaid<'info> {
    #[account(
        init,
        payer = payer,
        space = RequestMarker::SPACE,
        seeds = [b"request", request_id.as_bytes()],
        bump
    )]
    pub request_marker: Account<'info, RequestMarker>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UsernameRecord {
    pub owner: Pubkey,
    pub username: String,
    pub claimed_at: i64,
}

impl UsernameRecord {
    // discriminator + pubkey + (string prefix + max bytes) + i64
    pub const SPACE: usize = 8 + 32 + (4 + USERNAME_MAX_LEN) + 8;
}

// Empty on purpose — existence alone is the receipt that a request was
// paid. No fields means no reason to ever write to this account again.
#[account]
pub struct RequestMarker {}

impl RequestMarker {
    pub const SPACE: usize = 8; // discriminator only
}

#[error_code]
pub enum RegistryError {
    #[msg("Username must be 3-20 characters")]
    BadLength,
    #[msg("Username may only contain a-z, 0-9 and underscore")]
    BadCharacters,
    #[msg("Invalid request id")]
    BadRequestId,
    #[msg("This request has expired")]
    RequestExpired,
}
