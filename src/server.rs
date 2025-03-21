use std::net::SocketAddr;
use axum::{
    routing::{get, post},
    Router,
    Json,
    response::IntoResponse,
    extract::Extension,
};
use tower_http::services::ServeDir;
use thiserror::Error;
use mongodb::{options::ClientOptions, Client as MongoClient};
use serde::{Deserialize, Serialize};
use tower::ServiceExt;
use hyper::{Request, Body};

#[derive(Error, Debug)]
pub enum ServerError {
    #[error("Redis error: {0}")]
    RedisError(#[from] redis::RedisError),
    #[error("MongoDB error: {0}")]
    MongoError(#[from] mongodb::error::Error),
    #[error("Hyper error: {0}")]
    HyperError(String),
}

#[derive(Clone)]
pub struct AppState {
    mongo: MongoClient,
    redis: redis::Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChaosRequest {
    target_program: String,
    chaos_type: String,
    parameters: serde_json::Value,
}

pub async fn start_server(redis_url: &str, mongo_url: &str) -> Result<(), ServerError> {
    // Initialize Redis connection
    let redis_client = redis::Client::open(redis_url)?;
    let _redis_conn = redis_client.get_async_connection().await?;

    // Initialize MongoDB connection
    let mut client_options = ClientOptions::parse(mongo_url).await?;
    client_options.app_name = Some("glitch-gremlin-ai".to_string());
    
    let mongo_client = MongoClient::with_options(client_options)?;
    let app_state = AppState {
        mongo: mongo_client,
        redis: redis_client,
    };

    let app = Router::new()
        .route("/health", get(|| async { "OK" }))
        .route("/chaos", post(handle_chaos_request))
        .route("/ping", get(ping))
        .layer(Extension(app_state))
        .route("/static/*path", get(static_handler));

    // Bind to address
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Listening on {}", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .map_err(|e| ServerError::HyperError(e.to_string()))?;

    Ok(())
}

async fn static_handler(axum::extract::Path(path): axum::extract::Path<String>) -> impl IntoResponse {
    let serve_dir = ServeDir::new("static");
    let req = Request::builder()
        .uri(format!("/{}", path))
        .body(Body::empty())
        .unwrap();
    
    match serve_dir.oneshot(req).await {
        Ok(response) => response.into_response(),
        Err(_) => (axum::http::StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}

async fn handle_chaos_request(
    Extension(state): Extension<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    // Rate limiting using Redis
    let _redis_conn = match state.redis.get_async_connection().await {
        Ok(conn) => conn,
        Err(e) => return Json(serde_json::json!({
            "status": "error",
            "message": format!("Rate limiting service unavailable: {}", e)
        }))
    };

    // Store chaos request in MongoDB
    let db = state.mongo.database("glitch_gremlin");
    let collection = db.collection("chaos_requests");
    
    match collection.insert_one(payload, None).await {
        Ok(_) => Json(serde_json::json!({
            "status": "success",
            "message": "Chaos request queued for processing"
        })),
        Err(e) => Json(serde_json::json!({
            "status": "error",
            "message": format!("Failed to store chaos request: {}", e)
        }))
    }
}

async fn ping() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "OK"
    }))
} 