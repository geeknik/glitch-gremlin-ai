use solana_program::pubkey::Pubkey;

/// Utility for deploying program code to the Solana network
#[derive(Debug)]
pub struct ProgramDeployer {
    /// Public key of the program being deployed
    pub program_id: Pubkey,
}

impl ProgramDeployer {
    /// Creates new program deployer for the specified program ID
    ///
    /// # Arguments
    /// * `program_id` - Public key of program to deploy
    pub fn new(program_id: Pubkey) -> Self {
        Self { program_id }
    }
}
