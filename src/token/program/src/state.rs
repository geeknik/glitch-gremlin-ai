use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ChaosRequest {
    /// Owner of the request
    pub owner: Pubkey,
    /// Amount of tokens locked
    pub amount: u64,
    /// Current status (0=pending, 1=in_progress, 2=completed, 3=failed)
    pub status: u8,
    /// Parameters for the chaos test
    pub params: Vec<u8>,
    /// Reference to results (e.g. IPFS hash)
    pub result_ref: String,
}

impl ChaosRequest {
    pub fn new(owner: Pubkey, amount: u64, params: Vec<u8>) -> Self {
        Self {
            owner,
            amount,
            status: 0,
            params,
            result_ref: String::new(),
        }
    }
}
