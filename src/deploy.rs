use solana_program::pubkey::Pubkey;

pub struct ProgramDeployer {
    pub program_id: Pubkey,
}

impl ProgramDeployer {
    pub fn new(program_id: Pubkey) -> Self {
        Self { program_id }
    }
} 