use solana_program::pubkey::Pubkey;

/// Artificial Intelligence Assistant managing chaos simulations
#[derive(Debug)]
pub struct AIAssistant {
    /// Authority pubkey with admin privileges
    pub authority: Pubkey,
}

impl AIAssistant {
    /// Creates new AI Assistant with specified authority
    /// 
    /// # Arguments
    /// * `authority` - Initial authority public key
    pub fn new(authority: Pubkey) -> Self {
        Self { authority }
    }
}
