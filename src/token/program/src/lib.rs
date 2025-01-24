use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    declare_id,
};

declare_id!("GlitchGremlinProgram11111111111111111111");

/// 7/10 multisig authority addresses from DESIGN.md 9.1
const MULTISIG_SIGNERS: [&str; 10] = [
    "F1rStS1gNer11111111111111111111111111111111",
    "SeCoNdS1gNer11111111111111111111111111111111",
    "Th1rDS1gNer11111111111111111111111111111111",
    "FoUrThS1gNer11111111111111111111111111111111",
    "F1fThS1gNer11111111111111111111111111111111",
    "S1xThS1gNer11111111111111111111111111111111",
    "Se7enS1gNer11111111111111111111111111111111",
    "E1ghtS1gNer11111111111111111111111111111111",
    "N1nThS1gNer11111111111111111111111111111111",
    "T3nThS1gNer11111111111111111111111111111111",
];

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod governance;
pub mod token_manager;
pub mod zk;

use crate::processor::Processor;

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    Processor::process(program_id, accounts, instruction_data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Epoch;
    use solana_sdk::{signature::Signer, signer::keypair::Keypair};

    #[test]
    fn test_program_initialization() {
        let program_id = Pubkey::new_unique();
        let program_data = Keypair::new();
        let mut accounts = vec![
            AccountInfo::new(&program_data.pubkey(), false, false, &mut 0, &mut [], &program_id, false, Epoch::default()),
        ];

        assert!(Processor::validate_initialized(&program_id, &accounts).is_err());
    }

    #[test]
    fn test_security_level_validation() {
        let mut params = TestParams {
            security_level: 5, // Invalid level
            ..TestParams::default()
        };
        
        assert_eq!(
            Processor::validate_security_level(&params),
            Err(GlitchError::InvalidSecurityLevel.into())
        );
    }

    #[test]
    fn test_multisig_verification() {
        let signers = vec![Pubkey::new_unique(); 6]; // Only 6/10
        assert!(Processor::validate_multisig(&signers).is_err());
    }

    #[test]
    fn test_entropy_validation() {
        let mut data = vec![0u8; 32];
        data[0..4].copy_from_slice(&[0x53, 0x47, 0x58, 0x21]); // Valid SGX prefix
        
        let account = AccountInfo::new(
            &Pubkey::new_unique(),
            false,
            false,
            &mut 0,
            &mut data[..],
            &Pubkey::new_unique(),
            false,
            Epoch::default()
        );
        
        assert!(Processor::validate_entropy(&account).is_ok());
    }
}
