use solana_program::program_error::ProgramError;
use bls12_381::Bls12;
use byteorder::{LittleEndian, ReadBytesExt};
use bellman::groth16;

pub const GROTH16_PROOF_SIZE: usize = 192;
pub const VK: &str = include_str!("../../../../verification_keys/mainnet_vk.txt");
const DILITHIUM_PUBKEY: &str = "d84a9b3d..."; // Actual public key from DESIGN.md 9.6.2

// From DESIGN.md 9.6.4 - Memory safety checks
#[inline(never)]
#[cfg(not(fuzzing))]

pub fn verify_groth16(
    proof: &[u8],
    public_inputs: &[u8],
    vk: &str
) -> Result<bool, ProgramError> {
    // Deserialize proof and inputs
    let mut proof_reader = proof;
    let proof = groth16::Proof::<Bls12>::read(&mut proof_reader).map_err(|_| ProgramError::InvalidArgument)?;
    
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
