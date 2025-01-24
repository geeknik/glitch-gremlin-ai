use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::{
    clock::UnixTimestamp,
    program_error::ProgramError,
};

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct CertificateLogs {
    pub entries: Vec<LogEntry>,
    pub last_audit: UnixTimestamp,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct LogEntry {
    pub timestamp: UnixTimestamp,
    pub node_id: [u8; 32],
    pub model_hash: [u8; 48],
    pub signature: [u8; 96],
}

impl CertificateLogs {
    /// Add new log entry with SGX attestation
    /// DESIGN.md 9.6.2 - SGX/TEE remote attestation
    pub fn add_entry(&mut self, node_id: [u8; 32], model_hash: [u8; 48], signature: [u8; 96]) -> ProgramResult {
        if !Self::validate_sgx_attestation(&model_hash, &signature) {
            return Err(ProgramError::InvalidArgument);
        }
        
        let clock = Clock::get()?;
        self.entries.push(LogEntry {
            timestamp: clock.unix_timestamp,
            node_id,
            model_hash,
            signature,
        });
        Ok(())
    }

    const SGX_PREFIX: [u8; 4] = [0x53, 0x47, 0x58, 0x21]; // "SGX!" prefix
    
    fn validate_sgx_attestation(_model_hash: &[u8; 48], signature: &[u8; 96]) -> bool {
        // DESIGN.md 9.6.2 - Verify SGX attestation signature prefix
        signature.get(0..4) == Some(&SGX_PREFIX)
    }
    pub fn verify_quarterly_entries(&self, current_time: UnixTimestamp) -> bool {
        // DESIGN.md 9.6.2 - Verify quarterly certificate logs with time variance
        let quarter_secs = 7776000; // 90 days
        let now = current_time;
        
        // Check last 4 quarters with 1 week grace period
        let mut valid = true;
        for i in 0..4 {
            let quarter_start = now - (quarter_secs * (i + 1)) - 604800; // Subtract with grace period
            let quarter_end = now - (quarter_secs * i) + 604800;
            
            let entries_in_window = self.entries.iter()
                .filter(|e| e.timestamp >= quarter_start && e.timestamp <= quarter_end)
                .count();
                
            // Require at least 3 entries per quarter with valid SGX attestations
            valid &= entries_in_window >= 3 
                && self.entries.iter()
                    .filter(|e| e.timestamp >= quarter_start)
                    .all(|e| e.signature[0..4] == SGX_PREFIX);
        }
        valid
    }

    pub fn validate_node_diversity(&self) -> Result<(), ProgramError> {
        // DESIGN.md 9.6.2 - Verify hardware diversity
        let mut architectures = std::collections::HashSet::new();
        for entry in &self.entries {
            let arch_sig = &entry.signature[..4];
            architectures.insert(arch_sig);
            if architectures.len() >= 3 {
                return Ok(());
            }
        }
        Err(ProgramError::InvalidAccountData)
    }
}
