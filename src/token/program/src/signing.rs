use ed25519_dalek::{Signer, Verifier};

// Use new strongly-typed keys
fn secure_signing(
    signing_key: &ed25519_dalek::SigningKey, 
    verifying_key: &ed25519_dalek::VerifyingKey,
    message: &[u8]
) -> Result<(), SignError> {
    if signing_key.verifying_key() != verifying_key {
        return Err(SignError::KeyMismatch);
    }
    
    let signature = signing_key.try_sign(message)?;
    verifying_key.verify(message, &signature)?;
    
    Ok(())
}

// Force keypair validation
struct ValidatedKeypair {
    signing_key: ed25519_dalek::SigningKey,
    verifying_key: ed25519_dalek::VerifyingKey,
}

impl ValidatedKeypair {
    pub fn new() -> Self {
        let signing_key = ed25519_dalek::SigningKey::generate(&mut rand::rngs::OsRng);
        let verifying_key = signing_key.verifying_key();
        Self {
            signing_key,
            verifying_key,
        }
    }
}

#[derive(Debug)]
pub enum SignError {
    KeyMismatch,
    SigningFailed,
    VerificationFailed,
}

impl From<ed25519_dalek::SignatureError> for SignError {
    fn from(_: ed25519_dalek::SignatureError) -> Self {
        SignError::SigningFailed
    }
}
