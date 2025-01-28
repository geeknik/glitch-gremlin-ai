use mongodb::{options::ClientOptions, Client};
use tokio::runtime::Runtime;

pub async fn connect_db(connection_string: &str) -> Result<Client, WorkerError> {
    let client_options = ClientOptions::parse(connection_string)
        .await
        .map_err(|e| WorkerError::DatabaseError(e.to_string()))?;
    
    Client::with_options(client_options)
        .map_err(|e| WorkerError::DatabaseError(e.to_string()))
} 