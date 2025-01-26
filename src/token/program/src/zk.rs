use solana_program::program_error::ProgramError;
use bls12_381::Bls12;
use byteorder::{LittleEndian, ReadBytesExt};
use bellman::groth16;

pub const GROTH16_PROOF_SIZE: usize = 192;
pub const DILITHIUM_SIG_SIZE: usize = 2420; // CRYSTALS-Dilithium standard signature size
pub const VK: &str = include_str!("../keys/verification_key.key"); // Load from file
pub const DILITHIUM_PUBKEY: &[u8] = include_bytes!("../keys/dilithium.pub");

// From DESIGN.md 9.6.4 - Memory safety checks
#[inline(never)]
#[cfg(not(test))]  // Only disable in non-test builds

#[inline(never)]
#[cfg_attr(not(test), no_mangle)]
pub fn verify_groth16(
    proof: &[u8],
    public_inputs: &[u8],
    vk: &str
) -> Result<bool, ProgramError> {
    // DESIGN.md 9.6.4 Memory safety
    std::arch::asm!("mfence"); // Memory barrier
    std::arch::asm!("lfence"); // Speculative execution barrier
    
    // DESIGN.md 9.6.2 - Verify both classical and post-quantum proofs
    if proof.len() != GROTH16_PROOF_SIZE + DILITHIUM_SIG_SIZE {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Split proof into classical and post-quantum parts
    let (groth_proof, dilithium_sig) = proof.split_at(GROTH16_PROOF_SIZE);
    
    // Verify Dilithium signature first
    if !verify_dilithium_signature(dilithium_sig, public_inputs, DILITHIUM_PUBKEY)? {
        return Err(GlitchError::InvalidSignature.into());
    }
    
    // Then verify classical proof with enhanced error handling
    let mut proof_reader = groth_proof;
    let proof = groth16::Proof::<Bls12>::read(&mut proof_reader)
        .map_err(|e| {
            msg!("Failed to read Groth16 proof: {}", e);
            GlitchError::InvalidProof
        })?;
    
    // Convert inputs to scalars
    let inputs = read_public_inputs(public_inputs)?;
    
    // Load and prepare verification key
    let mut vk_reader = VK.as_bytes();
    let vk = groth16::VerifyingKey::<Bls12>::read(
        &mut vk_reader.as_ref()
    ).map_err(|_| ProgramError::InvalidArgument)?;
    let pvk = groth16::prepare_verifying_key(&vk);

    // Verify proof
    let scalar_inputs: Vec<bls12_381::Scalar> = inputs.iter()
        .map(|x| {
            // DESIGN.md 9.6.2 - Enhanced range checks for post-quantum security
            // Temporary workaround for scalar range check
            let max_val = bls12_381::Scalar::from_raw([u64::MAX; 4]);
            if x > &max_val {
                return Err(ProgramError::InvalidArgument);
            }
            
            // DESIGN.md 9.6.2 - Verify SGX attestation signature prefix
            if signature.get(0..4) != Some(&crate::processor::SGX_PREFIX) {
                return Err(ProgramError::InvalidArgument);
            }
            
            Ok(bls12_381::Scalar::from_bytes_wide(&x.to_bytes()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    
    Ok(groth16::verify_proof(&pvk, &proof, &scalar_inputs[..]).is_ok())
}

fn read_public_inputs(data: &[u8]) -> Result<Vec<Bls12>, ProgramError> {
    // Implementation from DESIGN.md 9.6.2 - Cryptographic Attestation
    let mut inputs = Vec::new();
    let mut cursor = std::io::Cursor::new(data);
    
    while cursor.position() < data.len() as u64 {
        let val = cursor.read_u64::<LittleEndian>()
            .map_err(|_| ProgramError::InvalidArgument)?;
        inputs.push(Bls12::from_bytes_le(&val.to_le_bytes()));
    }
    
    if inputs.len() < 2 {
        return Err(ProgramError::InvalidArgument);
    }

    Ok(inputs)
}
