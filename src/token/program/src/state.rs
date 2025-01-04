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
    /// Escrow account for tokens
    pub escrow_account: Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct EscrowAccount {
    /// Amount of tokens held
    pub amount: u64,
    /// Associated chaos request
    pub chaos_request: Pubkey,
    /// Timestamp when escrow expires
    pub expiry: i64,
}

impl ChaosRequest {
    pub fn new(owner: Pubkey, amount: u64, params: Vec<u8>, escrow_account: Pubkey) -> Self {
        Self {
            owner,
            amount,
            status: 0,
            params,
            result_ref: String::new(),
            escrow_account,
        }
    }
}

impl EscrowAccount {
    pub fn new(amount: u64, chaos_request: Pubkey, expiry: i64) -> Self {
        Self {
            amount,
            chaos_request,
            expiry,
        }
    }
}
