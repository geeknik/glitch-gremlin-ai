use solana_program::pubkey::Pubkey;
use crate::rpc::helius_client::{HeliusClient, ProgramStatus};
use std::path::Path;

mod verifier;
pub use verifier::{DeploymentVerifier, VerificationStatus, CheckResult, CheckStatus};

pub struct ProgramDeployer {
    helius_client: HeliusClient,
    verifier: DeploymentVerifier,
}

impl ProgramDeployer {
    pub fn new(helius_client: HeliusClient) -> Self {
        Self { 
            helius_client: helius_client.clone(),
            verifier: DeploymentVerifier::new(helius_client),
        }
    }

    /// Deploy program with optimal settings
    pub async fn deploy(
        &self,
        program_path: &Path,
        keypair_path: &Path,
    ) -> Result<Pubkey, Box<dyn std::error::Error>> {
        // Verify deployment readiness
        let verification = self.verifier.verify_deployment(program_path, keypair_path).await?;
        
        if !verification.is_ready {
            let failed_checks: Vec<_> = verification.checks
                .iter()
                .filter(|check| matches!(check.status, CheckStatus::Failed(_)))
                .collect();
                
            return Err(format!(
                "Program not ready for deployment. Failed checks:\n{}",
                failed_checks
                    .iter()
                    .map(|check| format!("- {}: {}", check.name, check.details))
                    .collect::<Vec<_>>()
                    .join("\n")
            ).into());
        }

        // Print warnings if any
        let warnings: Vec<_> = verification.checks
            .iter()
            .filter(|check| matches!(check.status, CheckStatus::Warning(_)))
            .collect();
            
        if !warnings.is_empty() {
            println!("Deployment warnings:");
            for check in warnings {
                println!("- {}: {}", check.name, check.details);
            }
        }

        // Read program data
        let program_data = std::fs::read(program_path)?;

        // Deploy program
        let program_id = self.helius_client.deploy_program(
            program_data,
            keypair_path.to_str().ok_or("Invalid keypair path")?,
        ).await?;

        // Verify deployment
        match self.helius_client.get_program_deployment_status(&program_id).await? {
            ProgramStatus::Deployed => Ok(program_id),
            ProgramStatus::NotDeployed => Err("Program deployment verification failed".into()),
        }
    }

    /// Upgrade program with optimal settings
    pub async fn upgrade(
        &self,
        program_id: &Pubkey,
        program_path: &Path,
        keypair_path: &Path,
        buffer_keypair_path: Option<&Path>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Verify upgrade readiness
        let verification = self.verifier.verify_deployment(program_path, keypair_path).await?;
        
        if !verification.is_ready {
            let failed_checks: Vec<_> = verification.checks
                .iter()
                .filter(|check| matches!(check.status, CheckStatus::Failed(_)))
                .collect();
                
            return Err(format!(
                "Program not ready for upgrade. Failed checks:\n{}",
                failed_checks
                    .iter()
                    .map(|check| format!("- {}: {}", check.name, check.details))
                    .collect::<Vec<_>>()
                    .join("\n")
            ).into());
        }

        // Print warnings if any
        let warnings: Vec<_> = verification.checks
            .iter()
            .filter(|check| matches!(check.status, CheckStatus::Warning(_)))
            .collect();
            
        if !warnings.is_empty() {
            println!("Upgrade warnings:");
            for check in warnings {
                println!("- {}: {}", check.name, check.details);
            }
        }

        // Read program data
        let program_data = std::fs::read(program_path)?;

        // Get optimal priority fee
        let priority_fee = self.helius_client.get_priority_fee().await?;

        // Prepare upgrade command
        let mut command = std::process::Command::new("solana");
        command
            .arg("program")
            .arg("deploy")
            .arg("--program-id")
            .arg(program_id.to_string())
            .arg("--keypair")
            .arg(keypair_path.to_str().ok_or("Invalid keypair path")?);

        // Add buffer keypair if provided
        if let Some(buffer_path) = buffer_keypair_path {
            command
                .arg("--buffer")
                .arg(buffer_path.to_str().ok_or("Invalid buffer keypair path")?);
        }

        // Add deployment options
        command
            .arg("--with-compute-unit-price")
            .arg(priority_fee.to_string())
            .arg("--max-sign-attempts")
            .arg("1000")
            .arg("--use-rpc");

        // Execute upgrade
        let output = command.output()?;
        if !output.status.success() {
            return Err(format!(
                "Program upgrade failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ).into());
        }

        // Verify upgrade
        match self.helius_client.get_program_deployment_status(program_id).await? {
            ProgramStatus::Deployed => Ok(()),
            ProgramStatus::NotDeployed => Err("Program upgrade verification failed".into()),
        }
    }

    /// Check if program is deployed
    pub async fn is_deployed(
        &self,
        program_id: &Pubkey,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        Ok(matches!(
            self.helius_client.get_program_deployment_status(program_id).await?,
            ProgramStatus::Deployed
        ))
    }

    /// Get program data
    pub async fn get_program_data(
        &self,
        program_id: &Pubkey,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        self.helius_client.get_program_data(program_id).await
    }
} 