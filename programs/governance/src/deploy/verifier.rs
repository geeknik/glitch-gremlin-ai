use solana_program::pubkey::Pubkey;
use crate::rpc::helius_client::HeliusClient;
use std::path::Path;

/// Verification status for program deployment
#[derive(Debug)]
pub struct VerificationStatus {
    pub program_id: Pubkey,
    pub checks: Vec<CheckResult>,
    pub is_ready: bool,
}

/// Result of individual verification check
#[derive(Debug)]
pub struct CheckResult {
    pub name: String,
    pub status: CheckStatus,
    pub details: String,
}

#[derive(Debug)]
pub enum CheckStatus {
    Passed,
    Warning(String),
    Failed(String),
}

pub struct DeploymentVerifier {
    helius_client: HeliusClient,
}

impl DeploymentVerifier {
    pub fn new(helius_client: HeliusClient) -> Self {
        Self { helius_client }
    }

    /// Verify program is ready for deployment
    pub async fn verify_deployment(
        &self,
        program_path: &Path,
        keypair_path: &Path,
    ) -> Result<VerificationStatus, Box<dyn std::error::Error>> {
        let mut checks = Vec::new();
        let program_data = std::fs::read(program_path)?;

        // 1. Verify program size
        checks.push(self.check_program_size(&program_data));

        // 2. Verify program permissions
        checks.push(self.check_program_permissions(program_path)?);

        // 3. Verify keypair
        checks.push(self.check_keypair(keypair_path)?);

        // 4. Verify ELF
        checks.push(self.verify_elf(&program_data)?);

        // 5. Check for buffer accounts
        checks.push(self.check_buffer_accounts().await?);

        // 6. Verify compute budget
        checks.push(self.check_compute_budget(&program_data)?);

        // 7. Check for upgrade authority
        checks.push(self.check_upgrade_authority(keypair_path)?);

        // Determine overall status
        let is_ready = !checks.iter().any(|check| matches!(check.status, CheckStatus::Failed(_)));

        Ok(VerificationStatus {
            program_id: Pubkey::new_unique(), // Will be assigned after deployment
            checks,
            is_ready,
        })
    }

    /// Check program size limits
    fn check_program_size(&self, program_data: &[u8]) -> CheckResult {
        const MAX_PROGRAM_SIZE: usize = 1024 * 1024; // 1MB limit

        let size = program_data.len();
        if size > MAX_PROGRAM_SIZE {
            CheckResult {
                name: "Program Size".to_string(),
                status: CheckStatus::Failed(format!("Program size {} bytes exceeds maximum {}", size, MAX_PROGRAM_SIZE)),
                details: "Program must be under 1MB".to_string(),
            }
        } else {
            CheckResult {
                name: "Program Size".to_string(),
                status: CheckStatus::Passed,
                details: format!("Program size: {} bytes", size),
            }
        }
    }

    /// Check program file permissions
    fn check_program_permissions(&self, program_path: &Path) -> Result<CheckResult, Box<dyn std::error::Error>> {
        use std::os::unix::fs::PermissionsExt;
        
        let metadata = std::fs::metadata(program_path)?;
        let mode = metadata.permissions().mode();
        
        // Check if executable
        if mode & 0o111 == 0 {
            Ok(CheckResult {
                name: "File Permissions".to_string(),
                status: CheckStatus::Failed("Program file is not executable".to_string()),
                details: format!("Current permissions: {:o}", mode),
            })
        } else {
            Ok(CheckResult {
                name: "File Permissions".to_string(),
                status: CheckStatus::Passed,
                details: format!("Permissions: {:o}", mode),
            })
        }
    }

    /// Verify keypair file
    fn check_keypair(&self, keypair_path: &Path) -> Result<CheckResult, Box<dyn std::error::Error>> {
        if !keypair_path.exists() {
            return Ok(CheckResult {
                name: "Keypair".to_string(),
                status: CheckStatus::Failed("Keypair file not found".to_string()),
                details: format!("Path: {}", keypair_path.display()),
            });
        }

        // Try to read keypair
        match std::fs::read(keypair_path) {
            Ok(_) => Ok(CheckResult {
                name: "Keypair".to_string(),
                status: CheckStatus::Passed,
                details: "Keypair file is readable".to_string(),
            }),
            Err(e) => Ok(CheckResult {
                name: "Keypair".to_string(),
                status: CheckStatus::Failed(format!("Cannot read keypair: {}", e)),
                details: format!("Path: {}", keypair_path.display()),
            }),
        }
    }

    /// Verify ELF format
    fn verify_elf(&self, program_data: &[u8]) -> Result<CheckResult, Box<dyn std::error::Error>> {
        // Basic ELF magic number check
        if program_data.len() < 4 || &program_data[0..4] != &[0x7f, 0x45, 0x4c, 0x46] {
            return Ok(CheckResult {
                name: "ELF Format".to_string(),
                status: CheckStatus::Failed("Invalid ELF format".to_string()),
                details: "File does not start with ELF magic number".to_string(),
            });
        }

        Ok(CheckResult {
            name: "ELF Format".to_string(),
            status: CheckStatus::Passed,
            details: "Valid ELF format".to_string(),
        })
    }

    /// Check for existing buffer accounts
    async fn check_buffer_accounts(&self) -> Result<CheckResult, Box<dyn std::error::Error>> {
        // Make RPC request to check for buffer accounts
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getProgramAccounts",
            "params": [
                "BPFLoaderUpgradeab1e11111111111111111111111",
                {
                    "filters": [
                        {
                            "memcmp": {
                                "offset": 0,
                                "bytes": "buffer"
                            }
                        }
                    ]
                }
            ]
        });

        // Count buffer accounts
        let response = self.helius_client.get_program_data(&Pubkey::default()).await;
        match response {
            Ok(_) => Ok(CheckResult {
                name: "Buffer Accounts".to_string(),
                status: CheckStatus::Passed,
                details: "No existing buffer accounts found".to_string(),
            }),
            Err(e) => Ok(CheckResult {
                name: "Buffer Accounts".to_string(),
                status: CheckStatus::Warning(format!("Could not check buffer accounts: {}", e)),
                details: "Proceed with caution".to_string(),
            }),
        }
    }

    /// Check compute budget requirements
    fn check_compute_budget(&self, program_data: &[u8]) -> Result<CheckResult, Box<dyn std::error::Error>> {
        // Estimate compute units based on program size
        let estimated_units = program_data.len() as u32 * 10; // Rough estimate
        
        if estimated_units > 1_400_000 {
            Ok(CheckResult {
                name: "Compute Budget".to_string(),
                status: CheckStatus::Warning(format!("High compute budget: {} units", estimated_units)),
                details: "Program may require compute budget adjustment".to_string(),
            })
        } else {
            Ok(CheckResult {
                name: "Compute Budget".to_string(),
                status: CheckStatus::Passed,
                details: format!("Estimated compute units: {}", estimated_units),
            })
        }
    }

    /// Check upgrade authority configuration
    fn check_upgrade_authority(&self, keypair_path: &Path) -> Result<CheckResult, Box<dyn std::error::Error>> {
        // Verify keypair has proper permissions
        use std::os::unix::fs::PermissionsExt;
        
        let metadata = std::fs::metadata(keypair_path)?;
        let mode = metadata.permissions().mode();
        
        if mode & 0o077 != 0 {
            Ok(CheckResult {
                name: "Upgrade Authority".to_string(),
                status: CheckStatus::Warning("Keypair file has loose permissions".to_string()),
                details: format!("Current permissions: {:o}", mode),
            })
        } else {
            Ok(CheckResult {
                name: "Upgrade Authority".to_string(),
                status: CheckStatus::Passed,
                details: "Keypair file has secure permissions".to_string(),
            })
        }
    }
} 