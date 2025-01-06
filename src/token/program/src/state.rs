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
    /// Rate limiting data
    pub rate_limit: RateLimitInfo,
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

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct StakeAccount {
    /// Owner of the stake
    pub owner: Pubkey,
    /// Amount of tokens staked
    pub amount: u64,
    /// When the stake was created
    pub start_time: i64,
    /// Duration of lockup in seconds
    pub lockup_period: u64,
    /// Accumulated rewards
    pub rewards: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct RateLimitInfo {
    /// Last request timestamp
    pub last_request: i64,
    /// Number of requests in current window
    pub request_count: u32,
    /// Start of current window
    pub window_start: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GovernanceProposal {
    /// Unique proposal ID
    pub id: u64,
    /// Creator of the proposal
    pub proposer: Pubkey,
    /// Proposal title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// When voting starts
    pub start_time: i64,
    /// When voting ends
    pub end_time: i64,
    /// Execution delay after passing
    pub execution_delay: u64,
    /// Yes votes
    pub yes_votes: u64,
    /// No votes
    pub no_votes: u64,
    /// Required quorum
    pub quorum: u64,
    /// Whether executed
    pub executed: bool,
    /// Vote weights by account
    pub vote_weights: Vec<VoteRecord>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteRecord {
    /// Voter's public key
    pub voter: Pubkey,
    /// Amount of voting power used
    pub weight: u64,
    /// Whether voted yes
    pub support: bool,
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
