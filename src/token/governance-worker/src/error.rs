use thiserror::Error;

#[derive(Error, Debug)]
pub enum GovernanceError {
    #[error("Failed to fetch proposal data")]
    ProposalFetchError,

    #[error("Failed to process proposal")]
    ProposalProcessError,

    #[error("Invalid proposal state")]
    InvalidProposalState,

    #[error("RPC client error: {0}")]
    ClientError(String),

    #[error("Serialization error")]
    SerializationError,
}
