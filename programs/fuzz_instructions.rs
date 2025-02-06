use anchor_lang::prelude::*;
use solana_sdk::pubkey::Pubkey;
use sha2::{Sha256, Digest};
use rayon::prelude::*;

/// Trait defining a fuzz instruction.
/// Fully optimized for minimal allocation and inlined getters.
pub trait FuzzInstruction {
    #[inline(always)]
    fn get_discriminator(&self) -> [u8; 8];
    #[inline(always)]
    fn get_program_id(&self) -> Pubkey;
    #[inline(always)]
    fn get_data(&self) -> Vec<u8>;
    #[inline(always)]
    fn get_accounts(&self) -> Vec<Pubkey>;
}

/// A sample fuzz instruction template.
/// Uses minimal cloning and inline hints for maximum efficiency.
#[derive(Debug, Clone)]
pub struct FuzzInstructionTemplate {
    pub discriminator: [u8; 8],
    pub program_id: Pubkey,
    pub data: Vec<u8>,
    pub accounts: Vec<Pubkey>,
}

impl FuzzInstruction for FuzzInstructionTemplate {
    #[inline(always)]
    fn get_discriminator(&self) -> [u8; 8] {
        self.discriminator
    }

    #[inline(always)]
    fn get_program_id(&self) -> Pubkey {
        self.program_id
    }

    #[inline(always)]
    fn get_data(&self) -> Vec<u8> {
        // Using clone is necessary to maintain immutability.
        self.data.clone()
    }

    #[inline(always)]
    fn get_accounts(&self) -> Vec<Pubkey> {
        self.accounts.clone()
    }
}

/// Creates an example fuzz instruction template in O(1) time.
///
/// The discriminator is generated using a SHA256 hash
/// (truncated to 8 bytes) in a fully optimized loop.
pub fn create_sample_fuzz_instruction() -> impl FuzzInstruction {
    let mut hasher = Sha256::new();
    hasher.update(b"fuzz0");
    let result = hasher.finalize();
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&result[..8]);
    
    FuzzInstructionTemplate {
        discriminator,
        program_id: Pubkey::new_unique(),
        data: vec![1, 2, 3, 4], // Sample instruction input bytes
        accounts: vec![Pubkey::new_unique(), Pubkey::new_unique()],
    }
}

/// Error type for fuzz test execution.
#[derive(Debug)]
pub enum FuzzError {
    ExecutionFailed,
}

/// Executes a slice of fuzz instructions in parallel for maximum throughput.
///
/// This function is fully optimized using Rayon for parallel iteration and
/// inlined instruction getters to minimize overhead.
#[inline(always)]
pub fn execute_fuzz_tests(instructions: &[impl FuzzInstruction]) -> Vec<Result<(), FuzzError>> {
    instructions.par_iter().map(|instr| {
        // Simulate optimized execution for each instruction.
        // Replace this placeholder logic with actual instruction execution.
        println!("Executing instruction with discriminator: {:?}", instr.get_discriminator());
        Ok(())
    }).collect()
}
