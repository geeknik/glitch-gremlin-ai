use redis::Client;
use std::time::Duration;

pub fn connect_redis(redis_url: &str) -> Result<Client, WorkerError> {
    redis::Client::open(redis_url)
        .map_err(|e| WorkerError::DatabaseError(format!("Redis connection error: {}", e)))
} 