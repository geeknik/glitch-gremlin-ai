use solana_program::pubkey::Pubkey;
use anchor_lang::prelude::*;
use crate::state::chaos_request::ChaosRequest;
use std::collections::HashMap;

/// Custom error type for governance operations
#[error_code]
pub enum GovernanceError {
    /// Operation requires authority privileges
    #[msg("Only authority can perform this operation")]
    UnauthorizedOperation,
    /// Request already exists for target program
    #[msg("Chaos request already exists for target program")]
    DuplicateRequest,
}

/// Governance state structure tracking program administration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GovernanceState {
    /// Authority public key with admin privileges
    pub authority: Pubkey,
    /// Count of active governance proposals
    pub proposal_count: u64,
    /// Active chaos requests
    pub chaos_requests: HashMap<Pubkey, ChaosRequest>,
}

impl GovernanceState {
    /// Creates new GovernanceState with initial values
    /// 
    /// # Arguments
    /// * `authority` - Initial authority public key
    pub fn new(authority: Pubkey) -> Self {
        Self {
            authority,
            proposal_count: 0,
            chaos_requests: HashMap::new(),
        }
    }

    /// Adds a new chaos request to the governance state
    ///
    /// # Arguments
    /// * `request` - The chaos request to add
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn add_chaos_request(&mut self, request: ChaosRequest) -> Result<()> {
        // Verify authority
        if request.authority != self.authority {
            return Err(error!(GovernanceError::UnauthorizedOperation));
        }

        // Check for duplicate request
        if self.chaos_requests.contains_key(&request.target_program) {
            return Err(error!(GovernanceError::DuplicateRequest));
        }
        
        self.chaos_requests.insert(request.target_program, request);
        Ok(())
    }

    /// Gets the status of a chaos request
    ///
    /// # Arguments
    /// * `target_program` - Public key of the program being tested
    ///
    /// # Returns
    /// * `Option<&ChaosRequest>` - The chaos request if found
    pub fn get_request(&self, target_program: &Pubkey) -> Option<&ChaosRequest> {
        self.chaos_requests.get(target_program)
    }
} 
