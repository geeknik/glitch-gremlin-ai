use solana_program::{
    borsh::try_from_slice_unchecked,
    program_pack::IsInitialized,
};

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct ModelHeader {
    pub version: u64,
    pub model_hash: [u8; 32],  // Blake3 hash of model weights
    pub activation_slot: u64,  // When this model becomes active
    pub creator: Pubkey,       // Governance PDA
    pub is_initialized: bool,
}

impl ModelRegistry {
    /// Vectorized model hash verification using SIMD
    #[inline(always)]
    pub fn verify_model(
        &self,
        model_data: &[u8],
        expected_hash: &[u8; 32]
    ) -> ProgramResult {
        let actual_hash = blake3::hash(model_data);
        
        // SIMD comparison for constant-time hash check
        let expected_simd = unsafe { vld1q_u8(expected_hash.as_ptr()) };
        let actual_simd = unsafe { vld1q_u8(actual_hash.as_bytes().as_ptr()) };
        
        if vminvq_u8(vceqq_u8(expected_simd, actual_simd)) == 0 {
            return Err(SecurityError::ModelVerificationFailed.into());
        }
        
        Ok(())
    }

    /// Governance-controlled model update
    pub fn update_model(
        &mut self,
        new_header: ModelHeader,
        model_data: &[u8],
        governance_sig: &[u8; 64]
    ) -> ProgramResult {
        // 1. Verify governance signature
        self.verify_governance_sig(&new_header, governance_sig)?;
        
        // 2. Validate model hash
        self.verify_model(model_data, &new_header.model_hash)?;
        
        // 3. Check version monotonicity
        if new_header.version <= self.current_version() {
            return Err(SecurityError::ModelVersionRegression.into());
        }
        
        // 4. Schedule activation (2 epochs in future for safety)
        let clock = Clock::get()?;
        new_header.activation_slot = clock.epoch + 2;
        
        // 5. Store new model
        self.store_model(new_header, model_data)
    }
}
