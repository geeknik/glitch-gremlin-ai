use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("GremlinGov11111111111111111111111111111111111");

#[program]
pub mod governance {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, config: GovernanceConfig) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.config = config;
        governance.total_proposals = 0;
        governance.is_initialized = true;
        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        voting_period: i64,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &mut ctx.accounts.governance;
        let clock = Clock::get()?;

        require!(
            title.len() <= 64 && description.len() <= 256,
            GovernanceError::InvalidProposalParameters
        );

        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.start_time = clock.unix_timestamp;
        proposal.end_time = clock.unix_timestamp + voting_period;
        proposal.execution_time = proposal.end_time + governance.config.execution_delay;
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.executed = false;
        proposal.state = ProposalState::Active;

        governance.total_proposals += 1;
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            proposal.state == ProposalState::Active,
            GovernanceError::InvalidProposalState
        );
        require!(
            clock.unix_timestamp <= proposal.end_time,
            GovernanceError::VotingPeriodEnded
        );

        let voting_power = ctx.accounts.token_account.amount;
        require!(
            voting_power > 0,
            GovernanceError::InsufficientVotingPower
        );

        if support {
            proposal.yes_votes += voting_power;
        } else {
            proposal.no_votes += voting_power;
        }

        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            !proposal.executed,
            GovernanceError::ProposalAlreadyExecuted
        );
        require!(
            clock.unix_timestamp >= proposal.execution_time,
            GovernanceError::ExecutionDelayNotElapsed
        );

        let total_votes = proposal.yes_votes + proposal.no_votes;
        let quorum = ctx.accounts.governance.config.quorum_percentage as u64 * total_votes / 100;

        require!(
            proposal.yes_votes >= quorum,
            GovernanceError::QuorumNotReached
        );

        proposal.executed = true;
        proposal.state = ProposalState::Executed;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<GovernanceState>())]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(
        init,
        payer = proposer,
        space = 8 + std::mem::size_of::<Proposal>()
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub voter: Signer<'info>,
    pub token_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub executor: Signer<'info>,
}

#[account]
pub struct GovernanceState {
    pub config: GovernanceConfig,
    pub total_proposals: u64,
    pub is_initialized: bool,
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
    pub execution_time: i64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub state: ProposalState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ProposalState {
    Draft,
    Active,
    Succeeded,
    Defeated,
    Executed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub voting_period: i64,
    pub quorum_percentage: u8,
    pub execution_delay: i64,
}

#[error_code]
pub enum GovernanceError {
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    #[msg("Proposal is not in valid state")]
    InvalidProposalState,
    #[msg("Voting period has ended")]
    VotingPeriodEnded,
    #[msg("Insufficient voting power")]
    InsufficientVotingPower,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,
    #[msg("Quorum not reached")]
    QuorumNotReached,
}
