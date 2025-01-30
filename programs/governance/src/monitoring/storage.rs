use anchor_lang::prelude::*;
use mongodb::{
    bson::{doc, Document},
    options::ClientOptions,
    Client, Collection,
};
use redis::{Client as RedisClient, Commands};
use serde::{Deserialize, Serialize};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::error::{GovernanceError, Result, WithErrorContext};
use super::{SecurityMetrics, SecurityAlert, AlertLevel, RiskOperation};

const CACHE_EXPIRY: u64 = 3600; // 1 hour
const ALERT_COLLECTION: &str = "security_alerts";
const METRICS_COLLECTION: &str = "security_metrics";
const RISK_OPS_COLLECTION: &str = "risk_operations";

#[derive(Debug, Serialize, Deserialize)]
pub struct StoredSecurityEvent {
    pub timestamp: i64,
    pub event_type: String,
    pub severity: AlertLevel,
    pub program_id: String,
    pub details: Document,
    pub metrics_snapshot: SecurityMetrics,
}

pub struct SecurityStorage {
    mongo_client: Client,
    redis_client: RedisClient,
    alert_collection: Collection<Document>,
    metrics_collection: Collection<Document>,
    risk_ops_collection: Collection<Document>,
}

impl SecurityStorage {
    pub async fn new() -> Result<Self> {
        // Initialize MongoDB
        let mongo_uri = env::var("MONGODB_URI")
            .map_err(|_| GovernanceError::ConfigError)
            .with_context("Storage", "Failed to get MongoDB URI from environment")?;
            
        let client_options = ClientOptions::parse(mongo_uri).await
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to parse MongoDB options")?;
            
        let mongo_client = Client::with_options(client_options)
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to create MongoDB client")?;
            
        // Initialize Redis
        let redis_url = env::var("REDIS_URL")
            .map_err(|_| GovernanceError::ConfigError)
            .with_context("Storage", "Failed to get Redis URL from environment")?;
            
        let redis_client = RedisClient::open(redis_url)
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to create Redis client")?;
            
        let db = mongo_client.database("glitch_gremlin");
        
        Ok(Self {
            mongo_client: mongo_client.clone(),
            redis_client,
            alert_collection: db.collection(ALERT_COLLECTION),
            metrics_collection: db.collection(METRICS_COLLECTION),
            risk_ops_collection: db.collection(RISK_OPS_COLLECTION),
        })
    }

    pub async fn store_security_event(
        &self,
        event_type: &str,
        severity: AlertLevel,
        program_id: &Pubkey,
        details: Document,
        metrics: &SecurityMetrics,
    ) -> Result<()> {
        let event = StoredSecurityEvent {
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            event_type: event_type.to_string(),
            severity,
            program_id: program_id.to_string(),
            details,
            metrics_snapshot: metrics.clone(),
        };

        // Store in MongoDB
        self.alert_collection
            .insert_one(mongodb::bson::to_document(&event).unwrap(), None)
            .await
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to store security event")?;

        // Cache in Redis if it's a high severity event
        if matches!(severity, AlertLevel::Critical | AlertLevel::High) {
            let cache_key = format!("security_event:{}:{}", program_id, event_type);
            let mut redis_conn = self.redis_client.get_connection()
                .map_err(|_| GovernanceError::StorageError)
                .with_context("Storage", "Failed to get Redis connection")?;
                
            redis_conn.set_ex(
                cache_key,
                serde_json::to_string(&event).unwrap(),
                CACHE_EXPIRY as usize,
            )
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to cache security event")?;
        }

        Ok(())
    }

    pub async fn get_recent_alerts(&self, program_id: &Pubkey, limit: i64) -> Result<Vec<SecurityAlert>> {
        // Try Redis first for cached alerts
        let cache_key = format!("recent_alerts:{}", program_id);
        let mut redis_conn = self.redis_client.get_connection()
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to get Redis connection")?;
            
        if let Ok(cached) = redis_conn.get::<_, String>(&cache_key) {
            if let Ok(alerts) = serde_json::from_str::<Vec<SecurityAlert>>(&cached) {
                return Ok(alerts);
            }
        }

        // Fallback to MongoDB
        let filter = doc! {
            "program_id": program_id.to_string(),
            "severity": {
                "$in": ["Critical", "High"]
            }
        };
        
        let options = mongodb::options::FindOptions::builder()
            .sort(doc! { "timestamp": -1 })
            .limit(limit)
            .build();

        let mut alerts = Vec::new();
        let mut cursor = self.alert_collection
            .find(filter, options)
            .await
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to query alerts")?;

        while let Ok(Some(doc)) = cursor.try_next().await {
            if let Ok(alert) = bson::from_document::<SecurityAlert>(doc) {
                alerts.push(alert);
            }
        }

        // Cache the results
        redis_conn.set_ex(
            cache_key,
            serde_json::to_string(&alerts).unwrap(),
            300, // Cache for 5 minutes
        )
        .map_err(|_| GovernanceError::StorageError)
        .with_context("Storage", "Failed to cache alerts")?;

        Ok(alerts)
    }

    pub async fn store_risk_operation(&self, operation: &RiskOperation) -> Result<()> {
        let doc = mongodb::bson::to_document(&operation)
            .map_err(|_| GovernanceError::SerializationError)
            .with_context("Storage", "Failed to serialize risk operation")?;

        self.risk_ops_collection
            .insert_one(doc, None)
            .await
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to store risk operation")?;

        Ok(())
    }

    pub async fn get_risk_operations(
        &self,
        program_id: &Pubkey,
        since: i64,
    ) -> Result<Vec<RiskOperation>> {
        let filter = doc! {
            "affected_accounts": program_id.to_string(),
            "timestamp": { "$gte": since }
        };

        let mut ops = Vec::new();
        let mut cursor = self.risk_ops_collection
            .find(filter, None)
            .await
            .map_err(|_| GovernanceError::StorageError)
            .with_context("Storage", "Failed to query risk operations")?;

        while let Ok(Some(doc)) = cursor.try_next().await {
            if let Ok(op) = bson::from_document::<RiskOperation>(doc) {
                ops.push(op);
            }
        }

        Ok(ops)
    }
} 