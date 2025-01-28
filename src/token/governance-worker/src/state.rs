use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct GovernanceProposal {
    pub id: u64,
    pub proposer: Pubkey,
    #[borsh(skip)]  // Now using proper borsh attribute
    pub description: String,
    pub target_program: Pubkey,
    pub status: ProposalStatus,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub start_time: i64,
    pub end_time: i64,
    // Added from DESIGN.md 9.3
    pub security_level: u8,
    pub execution_delay: i64,
    pub insurance_fund: Pubkey,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
    Expired,
    Queued,
    Vetoed,
}

impl borsh::BorshSerialize for ProposalStatus {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        let value = match self {
            ProposalStatus::Draft => 0u8,
            ProposalStatus::Active => 1,
            ProposalStatus::Succeeded => 2,
            ProposalStatus::Failed => 3,
            ProposalStatus::Executed => 4,
            ProposalStatus::Cancelled => 5,
            ProposalStatus::Expired => 6,
            ProposalStatus::Queued => 7,
            ProposalStatus::Vetoed => 8,
        };
        borsh::BorshSerialize::serialize(&value, writer)
    }
}

impl borsh::BorshDeserialize for ProposalStatus {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let value: u8 = borsh::BorshDeserialize::deserialize_reader(reader)?;
        Ok(match value {
            0 => ProposalStatus::Draft,
            1 => ProposalStatus::Active,
            2 => ProposalStatus::Succeeded,
            3 => ProposalStatus::Failed,
            4 => ProposalStatus::Executed,
            5 => ProposalStatus::Cancelled,
            6 => ProposalStatus::Expired,
            7 => ProposalStatus::Queued,
            8 => ProposalStatus::Vetoed,
            _ => return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Invalid proposal status value"
            )),
        })
    }
}

impl Default for ProposalStatus {
    fn default() -> Self {
        ProposalStatus::Draft
    }
}
