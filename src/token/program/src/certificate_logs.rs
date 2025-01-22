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
    pub fn verify_quarterly_entries(&self, current_time: UnixTimestamp) -> bool {
        // DESIGN.md 9.6.2 - Verify quarterly certificate logs
        let quarter_ago = current_time - 7776000; // 90 days in seconds
        self.entries.iter()
            .filter(|e| e.timestamp >= quarter_ago)
            .count() >= 3
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
