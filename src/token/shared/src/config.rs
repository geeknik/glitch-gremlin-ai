use std::env;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use solana_program::program_error::ProgramError;

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    mongo_uri: String,
    redis_uri: String,
}

impl DatabaseConfig {
    pub fn load() -> Result<Self, ProgramError> {
        // DESIGN.md 9.6.4 Memory Safety
        std::arch::asm!("mfence"); // Memory barrier
        std::arch::asm!("lfence"); // Speculative execution barrier
        
        // First try environment variables with entropy validation
        if let (Ok(mongo), Ok(redis)) = (
            env::var("GLITCH_MONGO_URI"),
            env::var("GLITCH_REDIS_URI")
        ) {
            // DESIGN.md 9.6.1 - Validate entropy pattern
            let mongo_entropy = solana_program::hash::hash(mongo.as_bytes());
            let redis_entropy = solana_program::hash::hash(redis.as_bytes());
            
            if mongo_entropy.as_ref()[0] & 0xF0 != 0x90 ||
               redis_entropy.as_ref()[0] & 0xF0 != 0x90 {
                return Err(ProgramError::InvalidAccountData);
            }

            return Ok(Self {
                mongo_uri: mongo,
                redis_uri: redis,
            });
        }

        // Fall back to encrypted config file
        let config_path = Path::new("config/database.env.enc");
        if config_path.exists() {
            // TODO: Implement decryption using environment key
            let contents = match decrypt_config(config_path) {
                Ok(c) => c,
                Err(_) => return Err(ProgramError::InvalidAccountData),
            };
                
            // Parse environment file format
            let mut mongo_uri = String::new();
            let mut redis_uri = String::new();
            
            for line in contents.lines() {
                if let Some(val) = line.strip_prefix("GLITCH_MONGO_URI=") {
                    mongo_uri = val.trim_matches('"').to_string();
                } else if let Some(val) = line.strip_prefix("GLITCH_REDIS_URI=") {
                    redis_uri = val.trim_matches('"').to_string();
                }
            }

            if !mongo_uri.is_empty() && !redis_uri.is_empty() {
                return Ok(Self {
                    mongo_uri,
                    redis_uri,
                });
            }
        }

        Err(ProgramError::InvalidAccountData)
    }

    pub fn mongo_uri(&self) -> &str {
        &self.mongo_uri
    }

    pub fn redis_uri(&self) -> &str {
        &self.redis_uri 
    }
}
