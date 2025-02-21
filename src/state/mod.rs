//! State Management Module
//! 
//! This module manages the on-chain state for the Glitch Gremlin Program, including:
//! - Governance state and administration
//! - Chaos request lifecycle management
//! - Program configuration and parameters
//! 
//! The state module is designed to be efficient and secure, utilizing Solana's
//! account model for data persistence while maintaining proper access controls.

/// Governance state definitions and operations
pub mod governance_state;

/// Chaos request management and processing
///
/// This module handles the creation, validation, and lifecycle management of chaos test
/// requests. It includes:
/// - Request creation and parameter validation
/// - Status tracking and updates
/// - Result storage and retrieval
/// - Security checks and access control
pub mod chaos_request;

// Re-export key types for convenience
pub use chaos_request::{ChaosRequest, ChaosRequestStatus};
pub use governance_state::{GovernanceState, GovernanceError}; 
