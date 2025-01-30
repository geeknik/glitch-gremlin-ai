use solana_program::pubkey::Pubkey;

pub struct AIAssistant {
    pub authority: Pubkey,
}

impl AIAssistant {
    pub fn new(authority: Pubkey) -> Self {
        Self { authority }
    }
} 