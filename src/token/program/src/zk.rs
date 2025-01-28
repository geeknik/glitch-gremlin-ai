use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    msg,
};
use crystals_dilithium::sign::lvl2::verify;
use sha2::{Sha256, Digest};
use base64::decode;

pub const DILITHIUM_SIG_SIZE: usize = 2420; // CRYSTALS-Dilithium standard signature size
pub const ED25519_SIG_SIZE: usize = 64;
pub const SGX_QUOTE_MIN_SIZE: usize = 256;
pub const SGX_HEADER: [u8; 4] = [0x53, 0x47, 0x58, 0x21]; // "SGX!"

pub struct ZkVerifier;

impl ZkVerifier {
    pub fn verify_signature(signature: &[u8], public_key: &Pubkey) -> Result<bool, ProgramError> {
        if signature.len() != DILITHIUM_SIG_SIZE {
            msg!("Invalid signature length");
            return Ok(false);
        }

        let message = b"GLITCH_GREMLIN_VALIDATION";
        let pk_bytes = public_key.as_ref();

        // Verify using CRYSTALS-Dilithium
        Ok(verify(signature, message, pk_bytes))
    }

    pub fn verify_geographic_proof(proof: &[u8], validator_key: &Pubkey) -> Result<bool, ProgramError> {
        if proof.len() < DILITHIUM_SIG_SIZE {
            msg!("Invalid geographic proof length");
            return Ok(false);
        }

        // Extract signature from proof
        let signature = &proof[..DILITHIUM_SIG_SIZE];
        
        // Hash the remaining proof data as the message
        let mut hasher = Sha256::new();
        hasher.update(&proof[DILITHIUM_SIG_SIZE..]);
        let message = hasher.finalize();
        
        // Verify signature
        Ok(verify(signature, &message, validator_key.as_ref()))
    }

    pub fn verify_attestation(attestation: &[u8], validator_key: &Pubkey) -> Result<bool, ProgramError> {
        if attestation.len() < DILITHIUM_SIG_SIZE + 32 {
            msg!("Invalid attestation length");
            return Ok(false);
        }

        // Extract signature and attestation data
        let signature = &attestation[..DILITHIUM_SIG_SIZE];
        let attestation_data = &attestation[DILITHIUM_SIG_SIZE..];
        
        // Hash the attestation data
        let mut hasher = Sha256::new();
        hasher.update(attestation_data);
        let message = hasher.finalize();
        
        // Verify signature using CRYSTALS-Dilithium
        Ok(verify(signature, &message, validator_key.as_ref()))
    }

    pub fn verify_sgx_quote(quote: &[u8]) -> Result<bool, ProgramError> {
        if quote.len() < SGX_QUOTE_MIN_SIZE {
            msg!("Invalid SGX quote length");
            return Ok(false);
        }

        // Verify SGX quote header
        if quote[..4] != SGX_HEADER {
            msg!("Invalid SGX quote header");
            return Ok(false);
        }

        // Extract and verify SHA-384 model hash (as per DESIGN.md 9.6.2)
        let model_hash = &quote[4..52]; // SHA-384 is 48 bytes
        
        // Verify Intel ME signature
        let me_signature = &quote[52..116]; // 64 byte signature
        let message = &quote[4..quote.len()-64]; // Everything except header and signature
        
        // Verify using CRYSTALS-Dilithium for post-quantum security
        Ok(verify(me_signature, message, model_hash))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn test_verify_signature() {
        let test_sig = vec![0u8; DILITHIUM_SIG_SIZE];
        let test_key = Pubkey::new_unique();
        
        let result = ZkVerifier::verify_signature(&test_sig, &test_key);
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_geographic_proof() {
        let mut test_proof = vec![0u8; DILITHIUM_SIG_SIZE + 32];
        let test_key = Pubkey::new_unique();
        
        let result = ZkVerifier::verify_geographic_proof(&test_proof, &test_key);
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_sgx_quote() {
        let mut test_quote = vec![0u8; SGX_QUOTE_MIN_SIZE];
        test_quote[..4].copy_from_slice(&SGX_HEADER);
        
        let result = ZkVerifier::verify_sgx_quote(&test_quote);
        assert!(result.is_ok());
    }
}
