use axum::{
    extract::{State, WebSocketUpgrade},
    response::Html,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use solana_program::pubkey::Pubkey;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

use crate::ai_assistant::GovernanceAssistant;

/// Shared application state
pub struct AppState {
    assistant: RwLock<GovernanceAssistant>,
}

/// Message from client
#[derive(Debug, Deserialize)]
struct ClientMessage {
    pubkey: String,
    message: String,
}

/// Message to client
#[derive(Debug, Serialize)]
struct ServerMessage {
    response: String,
    governance_state: GovernanceState,
}

/// Governance state for UI
#[derive(Debug, Serialize)]
struct GovernanceState {
    total_staked: String,
    staker_count: u32,
    treasury_balance: String,
    emergency_reserve: String,
    governance_apy: String,
    spooky_bonus: String,
    quorum_percentage: u8,
    active_proposals: Vec<ProposalInfo>,
}

/// Proposal info for UI
#[derive(Debug, Serialize)]
struct ProposalInfo {
    id: u64,
    title: String,
    category: String,
    status: String,
    time_remaining: String,
    votes: VoteInfo,
    quorum_progress: f64,
}

/// Vote info for UI
#[derive(Debug, Serialize)]
struct VoteInfo {
    yes: u64,
    no: u64,
    abstain: u64,
}

/// Start the governance web server
pub async fn start_server(redis_url: &str, mongo_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize AI assistant
    let assistant = GovernanceAssistant::new(redis_url, mongo_url).await?;
    
    // Create shared state
    let state = Arc::new(AppState {
        assistant: RwLock::new(assistant),
    });

    // Create router
    let app = Router::new()
        .route("/", get(serve_index))
        .route("/ws", get(handle_ws))
        .route("/api/metrics", get(get_metrics))
        .route("/api/proposals", get(get_proposals))
        .route("/api/chat", post(handle_chat))
        .nest_service("/assets", ServeDir::new("assets"))
        .with_state(state);

    // Start server
    println!("Starting server on http://localhost:3000");
    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await?;

    Ok(())
}

/// Serve index.html
async fn serve_index() -> Html<&'static str> {
    Html(include_str!("../../../assets/index.html"))
}

/// Handle WebSocket connection
async fn handle_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle WebSocket connection
async fn handle_socket(
    mut socket: axum::extract::ws::WebSocket,
    state: Arc<AppState>,
) {
    use axum::extract::ws::Message;
    use futures::{SinkExt, StreamExt};

    while let Some(Ok(msg)) = socket.next().await {
        if let Message::Text(text) = msg {
            // Parse client message
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                // Get pubkey
                if let Ok(pubkey) = Pubkey::try_from(client_msg.pubkey.as_str()) {
                    // Process message
                    let mut assistant = state.assistant.write().await;
                    if let Ok(response) = assistant.process_message(&pubkey, &client_msg.message).await {
                        // Get current governance state
                        let governance_state = get_governance_state(&assistant).await;
                        
                        // Send response
                        let server_msg = ServerMessage {
                            response,
                            governance_state,
                        };
                        
                        if let Ok(json) = serde_json::to_string(&server_msg) {
                            let _ = socket.send(Message::Text(json)).await;
                        }
                    }
                }
            }
        }
    }
}

/// Get current metrics
async fn get_metrics(
    State(state): State<Arc<AppState>>,
) -> Json<GovernanceState> {
    let assistant = state.assistant.read().await;
    let governance_state = get_governance_state(&assistant).await;
    Json(governance_state)
}

/// Get active proposals
async fn get_proposals(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<ProposalInfo>> {
    let assistant = state.assistant.read().await;
    let proposals = get_proposal_info(&assistant).await;
    Json(proposals)
}

/// Handle chat message
async fn handle_chat(
    State(state): State<Arc<AppState>>,
    Json(msg): Json<ClientMessage>,
) -> Json<ServerMessage> {
    let mut assistant = state.assistant.write().await;
    
    let response = if let Ok(pubkey) = Pubkey::try_from(msg.pubkey.as_str()) {
        assistant.process_message(&pubkey, &msg.message).await
            .unwrap_or_else(|e| format!("Error: {}", e))
    } else {
        "Invalid public key".to_string()
    };

    let governance_state = get_governance_state(&assistant).await;
    
    Json(ServerMessage {
        response,
        governance_state,
    })
}

/// Get governance state for UI
async fn get_governance_state(assistant: &GovernanceAssistant) -> GovernanceState {
    GovernanceState {
        total_staked: format!("{:.1}M", assistant.governance.metrics.total_staked as f64 / 1_000_000.0),
        staker_count: assistant.governance.metrics.staker_count,
        treasury_balance: format!("{:.1}M", assistant.governance.metrics.treasury_balance as f64 / 1_000_000.0),
        emergency_reserve: format!("{}%", assistant.governance.metrics.emergency_reserve),
        governance_apy: format!("{}%", assistant.governance.metrics.governance_apy),
        spooky_bonus: format!("{}%", assistant.governance.metrics.spooky_bonus),
        quorum_percentage: assistant.governance.metrics.quorum_percentage,
        active_proposals: get_proposal_info(assistant).await,
    }
}

/// Get proposal info for UI
async fn get_proposal_info(assistant: &GovernanceAssistant) -> Vec<ProposalInfo> {
    assistant.governance.active_proposals.values()
        .map(|p| ProposalInfo {
            id: p.id,
            title: p.title.clone(),
            category: format!("{:?}", p.category),
            status: format!("{:?}", p.status),
            time_remaining: format!("{} days", p.time_remaining / (24 * 60 * 60)),
            votes: VoteInfo {
                yes: p.votes.yes,
                no: p.votes.no,
                abstain: p.votes.abstain,
            },
            quorum_progress: p.quorum_progress,
        })
        .collect()
} 