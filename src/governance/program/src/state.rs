use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
};
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Proposal {
    pub title: String,
    pub description: String,
    pub proposer: Pubkey,
    pub vote_counts: VoteCounts,
    pub status: ProposalStatus,
    pub created_at: i64,
    pub voting_starts_at: i64,
    pub voting_ends_at: i64,
    pub escrow_account: Pubkey,
    pub test_params: TestParams,
    pub execution_delay: u64,
    pub quorum: u64,
    pub security_level: u8,
    pub multisig_signers: Vec<Pubkey>,
    pub required_signatures: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct VoteCounts {
    pub yes: u64,
    pub no: u64,
    pub abstain: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct TestParams {
    pub security_level: u8,
    pub test_duration: u64,
    pub min_coverage: u8,
    pub max_vulnerability_density: u8,
}

impl Default for VoteCounts {
    fn default() -> Self {
        Self {
            yes: 0,
            no: 0,
            abstain: 0,
        }
    }
}

impl Proposal {
    pub fn new(
        title: String,
        description: String,
        proposer: Pubkey,
        escrow_account: Pubkey,
        test_params: TestParams,
        execution_delay: u64,
        quorum: u64,
        security_level: u8,
        multisig_signers: Vec<Pubkey>,
        required_signatures: u8,
    ) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        Self {
            title,
            description,
            proposer,
            vote_counts: VoteCounts::default(),
            status: ProposalStatus::Draft,
            created_at: now,
            voting_starts_at: now,
            voting_ends_at: now + (7 * 24 * 60 * 60), // 7 days voting period
            escrow_account,
            test_params,
            execution_delay,
            quorum,
            security_level,
            multisig_signers,
            required_signatures,
        }
    }

    pub fn cast_vote(&mut self, vote: bool) -> Result<(), ProgramError> {
        match vote {
            true => self.vote_counts.yes += 1,
            false => self.vote_counts.no += 1,
        }
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.status == ProposalStatus::Active && 
        now >= self.voting_starts_at && 
        now <= self.voting_ends_at
    }

    pub fn has_reached_quorum(&self) -> bool {
        let total_votes = self.vote_counts.yes + self.vote_counts.no + self.vote_counts.abstain;
        total_votes >= self.quorum
    }

    pub fn finalize(&mut self) -> Result<(), ProgramError> {
        if !self.has_reached_quorum() {
            return Err(ProgramError::InvalidArgument);
        }

        self.status = if self.vote_counts.yes > self.vote_counts.no {
            ProposalStatus::Succeeded
        } else {
            ProposalStatus::Failed
        };

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proposal_voting() {
        let mut proposal = Proposal::new(
            "Test".to_string(),
            "Description".to_string(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            TestParams {
                security_level: 1,
                test_duration: 3600,
                min_coverage: 80,
                max_vulnerability_density: 5,
            },
            3600,
            100,
            1,
            vec![Pubkey::new_unique()],
            1,
        );

        assert!(proposal.cast_vote(true).is_ok());
        assert_eq!(proposal.vote_counts.yes, 1);
        assert_eq!(proposal.vote_counts.no, 0);
    }
} 