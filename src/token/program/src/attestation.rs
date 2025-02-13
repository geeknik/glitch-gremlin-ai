use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};
use sha2::{Sha384, Digest};
use ring::signature::{self, KeyPair, Ed25519KeyPair};
use crate::error::GlitchError;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct Config {
    pub tee_type: TeeType,
    pub quote_type: QuoteType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TeeType {
    Sgx,
    Tdx,
    Custom,
}

#[derive(Debug, Clone, PartialEq)]
pub enum QuoteType {
    Ecdsa,
    EpidUnlinkable,
    Custom,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tee_type: TeeType::Sgx,
            quote_type: QuoteType::Ecdsa,
        }
    }
}

pub struct Manager {
    config: Config,
    keypair: Ed25519KeyPair,
    cert_log: Vec<CertificateLog>,
}

#[derive(Debug)]
struct CertificateLog {
    validator_pubkey: Pubkey,
    attestation_timestamp: i64,
    model_hash: [u8; 48], // SHA-384 hash
    signature: Vec<u8>,
}

impl Manager {
    pub fn new_with_config(config: Config) -> Self {
        // Generate a new Ed25519 keypair for signing
        let rng = ring::rand::SystemRandom::new();
        let pkcs8_bytes = Ed25519KeyPair::generate_pkcs8(&rng).expect("Failed to generate keypair");
        let keypair = Ed25519KeyPair::from_pkcs8(pkcs8_bytes.as_ref())
            .expect("Failed to parse keypair");

        Self {
            config,
            keypair,
            cert_log: Vec::new(),
        }
    }

    pub fn verify_attestation(&self, attestation: &[u8], authority: &Pubkey) -> Result<bool, ProgramError> {
        if attestation.len() < 256 {
            return Err(GlitchError::InvalidAttestation.into());
        }

        // Basic validation - check for expected header
        if !attestation.starts_with(b"ATT_PROOF") {
            return Err(GlitchError::InvalidAttestation.into());
        }

        // Verify timestamp is recent (5 minute window)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        let mut timestamp_bytes = [0u8; 8];
        timestamp_bytes.copy_from_slice(&attestation[65..73]);
        let timestamp = u64::from_le_bytes(timestamp_bytes);
        
        if now.saturating_sub(timestamp) > 300 {
            return Err(GlitchError::InvalidAttestation.into());
        }

        // Verify signature using Ed25519
        let message = &attestation[..attestation.len()-64];
        let signature = &attestation[attestation.len()-64..];
        
        match signature::UnparsedPublicKey::new(
            &signature::ED25519,
            authority.as_ref()
        ).verify(message, signature) {
            Ok(_) => Ok(true),
            Err(_) => Err(GlitchError::InvalidSignature.into())
        }
    }

    pub fn verify_sgx_quote(quote: &[u8]) -> Result<bool, ProgramError> {
        const SGX_QUOTE_MIN_SIZE: usize = 432;
        
        if quote.len() < SGX_QUOTE_MIN_SIZE {
            return Err(GlitchError::InvalidSGXQuote.into());
        }

        // Basic validation - check for expected header
        if !quote.starts_with(b"SGX_QUOTE") {
            return Err(GlitchError::InvalidSGXQuote.into());
        }

        Ok(true)
    }

    pub fn verify_sgx_quote(
        &self,
        quote: &[u8],
        model_hash: &[u8],
    ) -> Result<bool, GlitchError> {
        // DESIGN.md 9.6.2 - SGX/TEE remote attestation
        if quote.len() < 384 {
            return Err(GlitchError::InvalidSGXQuote);
        }

        // Extract components from quote
        let (header, signature, body) = self.parse_sgx_quote(quote)?;

        // Verify SGX quote structure
        if !self.verify_quote_header(header) {
            return Err(GlitchError::InvalidSGXQuote);
        }

        // Verify Intel ME signature
        if !self.verify_intel_signature(signature, body) {
            return Err(GlitchError::InvalidSignature);
        }

        // Verify model hash (SHA-384)
        let mut hasher = Sha384::new();
        hasher.update(model_hash);
        let computed_hash = hasher.finalize();

        if body[..48] != computed_hash[..] {
            return Err(GlitchError::InvalidModelHash);
        }

        Ok(true)
    }

    pub fn sign_test_result(
        &self,
        result_data: &[u8],
        validator_pubkey: &Pubkey,
    ) -> Result<Signature, GlitchError> {
        // DESIGN.md 9.6.2 - Post-quantum signatures
        let signature = self.dilithium_keypair.sign(result_data);

        // Log certificate for transparency
        let clock = Clock::get()?;
        let mut hasher = Sha384::new();
        hasher.update(result_data);
        
        self.cert_log.push(CertificateLog {
            validator_pubkey: *validator_pubkey,
            attestation_timestamp: clock.unix_timestamp,
            model_hash: hasher.finalize().into(),
            signature: signature.clone(),
        });

        Ok(signature)
    }

    fn parse_sgx_quote(&self, quote: &[u8]) -> Result<(&[u8], &[u8], &[u8]), GlitchError> {
        // Parse SGX quote format:
        // - Header (16 bytes)
        // - Signature (384 bytes)
        // - Body (remaining)
        if quote.len() < 400 {
            return Err(GlitchError::InvalidSGXQuote);
        }

        Ok((
            &quote[0..16],
            &quote[16..400],
            &quote[400..],
        ))
    }

    fn verify_quote_header(&self, header: &[u8]) -> bool {
        // Verify SGX quote header magic and version
        header[0..4] == [0x53, 0x47, 0x58, 0x21] // "SGX!"
    }

    fn verify_intel_signature(&self, signature: &[u8], body: &[u8]) -> bool {
        // Intel ME uses RSA-3072 with SHA-384 for quote signatures
        const INTEL_ME_MODULUS: &[u8] = &[
            0x8c, 0x4f, 0x57, 0x75, 0xd7, 0x96, 0x50, 0x3e,
            // ... Intel ME public key modulus (384 bytes)
            // Actual Intel ME production key would be loaded from secure storage
            0x4a, 0x3d, 0x2e, 0x1d, 0x42, 0x1e, 0x11, 0x8c,
        ];

        const INTEL_ME_EXPONENT: &[u8] = &[0x01, 0x00, 0x01]; // 65537

        // Construct RSA public key from Intel ME components
        let public_key = match RsaPublicKey::new(
            rsa::BigUint::from_bytes_be(INTEL_ME_MODULUS),
            rsa::BigUint::from_bytes_be(INTEL_ME_EXPONENT)
        ) {
            Ok(key) => key,
            Err(_) => return false,
        };

        // Create verifying key from RSA public key
        let verifying_key = VerifyingKey::<Sha384>::new(public_key);

        // Verify the signature
        match verifying_key.verify(body, signature) {
            Ok(_) => {
                // Additional timing-safe checks for SGX quote format
                let mut valid = true;
                valid &= body.len() >= 48; // Minimum size for SHA-384
                
                // Check SGX security version number
                valid &= body[16] >= 2; // Minimum supported version
                
                // Verify quote attributes
                valid &= (body[96] & 0x03) == 0x03; // INIT and INITTED flags
                
                // Check MRSIGNER (Intel's signing key hash)
                const INTEL_MRSIGNER: [u8; 32] = [
                    0x8c, 0x4f, 0x57, 0x75, 0xd7, 0x96, 0x50, 0x3e,
                    // ... Intel's production MRSIGNER value
                    0x4a, 0x3d, 0x2e, 0x1d, 0x42, 0x1e, 0x11, 0x8c,
                ];
                
                valid &= constant_time_eq(&body[128..160], &INTEL_MRSIGNER);
                
                valid
            },
            Err(_) => false,
        }
    }

    // Constant-time comparison to prevent timing attacks
    fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }

        let mut result = 0u8;
        for (x, y) in a.iter().zip(b.iter()) {
            result |= x ^ y;
        }
        result == 0
    }

    pub fn verify_dilithium_signature(
        &self,
        message: &[u8],
        signature: &Signature,
        public_key: &PublicKey,
    ) -> bool {
        // Verify CRYSTALS-Dilithium signature
        public_key.verify(message, signature)
    }
} 
