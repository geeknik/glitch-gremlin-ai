#[derive(Clone, Copy)]
#[repr(C, align(64))]
struct ChaosRequest {
    base_fee: u64,
    nonce: [u8; 32],
    program_id: Pubkey,
    challenge: [u8; 32],
    merkle_root: [u8; 32],
    signature: [u8; 64],
}

impl ChaosRequest {
    #[inline(always)]
    fn verify(&self, treasury: &Treasury) -> Result<(), ChaosError> {
        let msg = self.nonce
            .iter()
            .chain(&self.program_id.to_bytes())
            .chain(&self.challenge)
            .copied()
            .collect::<Vec<_>>();
        
        let sig = ed25519_dalek::Signature::from_bytes(&self.signature);
        treasury.verifying_key.verify(&msg, &sig)?;
        
        // Verify fee escrow
        let expected_fee = self.base_fee * (self.nonce[0] as u64 + 1);
        if treasury.get_balance(self.program_id)? < expected_fee {
            return Err(ChaosError::InsufficientFee);
        }
        
        Ok(())
    }
}
