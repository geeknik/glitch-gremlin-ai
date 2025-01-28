use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use crate::state::{GovernanceProposal, ProposalStatus};

pub struct StateManager;

impl StateManager {
    pub fn load_proposal(
        account: &AccountInfo,
    ) -> Result<GovernanceProposal, ProgramError> {
        let data = account.try_borrow_data()?;
        GovernanceProposal::try_from_slice(&data)
            .map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn save_proposal(
        account: &AccountInfo,
        proposal: &GovernanceProposal,
    ) -> Result<(), ProgramError> {
        let mut data = account.try_borrow_mut_data()?;
        proposal.serialize(&mut *data)
            .map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn update_proposal_status(
        account: &AccountInfo,
        new_status: ProposalStatus,
    ) -> Result<(), ProgramError> {
        let mut proposal = Self::load_proposal(account)?;
        proposal.status = new_status;
        Self::save_proposal(account, &proposal)
    }
} 