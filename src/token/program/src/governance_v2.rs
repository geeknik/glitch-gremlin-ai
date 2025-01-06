use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    clock::Clock,
    sysvar::Sysvar,
};
use crate::error::GlitchError;
use crate::state::{GovernanceProposal, VoteRecord};

pub struct GovernanceManager;

impl GovernanceManager {
    pub fn create_proposal(
        proposal: &mut GovernanceProposal,
        proposer: Pubkey,
        title: String,
        description: String,
        clock: &Clock,
    ) -> ProgramResult {
        if title.is_empty() || description.is_empty() {
            return Err(GlitchError::InvalidProposal.into());
        }

        proposal.proposer = proposer;
        proposal.title = title;
        proposal.description = description;
        proposal.start_time = clock.unix_timestamp;
        proposal.end_time = clock.unix_timestamp + 259200; // 3 day voting period
        proposal.execution_delay = 86400; // 24 hour delay
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.quorum = 1000; // 1000 minimum votes needed
        proposal.executed = false;
        proposal.vote_weights = Vec::new();

        Ok(())
    }

    pub fn cast_vote(
        proposal: &mut GovernanceProposal,
        voter: Pubkey,
        weight: u64,
        support: bool,
        clock: &Clock,
    ) -> ProgramResult {
        // Check voting period
        if clock.unix_timestamp < proposal.start_time {
            return Err(GlitchError::VotingNotStarted.into());
        }
        if clock.unix_timestamp > proposal.end_time {
            return Err(GlitchError::VotingEnded.into());
        }

        // Check for duplicate votes
        if proposal.vote_weights.iter().any(|v| v.voter == voter) {
            return Err(GlitchError::InvalidVoteWeight.into());
        }

        // Record vote
        proposal.vote_weights.push(VoteRecord {
            voter,
            weight,
            support,
        });

        // Update vote tallies
        if support {
            proposal.yes_votes += weight;
        } else {
            proposal.no_votes += weight;
        }

        Ok(())
    }

    pub fn execute_proposal(
        proposal: &mut GovernanceProposal,
        clock: &Clock,
    ) -> ProgramResult {
        if proposal.executed {
            return Err(GlitchError::ProposalAlreadyExecuted.into());
        }

        // Check if proposal passed
        if proposal.yes_votes + proposal.no_votes < proposal.quorum {
            return Err(GlitchError::QuorumNotReached.into());
        }

        // Check execution delay
        let execution_time = proposal.end_time + proposal.execution_delay as i64;
        if clock.unix_timestamp < execution_time {
            return Err(GlitchError::VotingNotStarted.into());
        }

        proposal.executed = true;
        Ok(())
    }
}
