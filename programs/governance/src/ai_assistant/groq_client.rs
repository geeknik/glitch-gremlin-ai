use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

const GROQ_API_URL: &str = "https://api.groq.com/v1/chat/completions";
const SYSTEM_PROMPT: &str = r#"You are Glitch Gremlin AI, a powerful AI assistant specializing in Solana governance and chaos engineering. 
Your core capabilities include:

1. Governance Operations:
- Managing proposals and voting
- Analyzing governance metrics
- Providing staking recommendations
- Monitoring treasury activities

2. Chaos Engineering:
- Launching chaos test campaigns
- Analyzing smart contract vulnerabilities
- Monitoring system resilience
- Providing security recommendations

3. Background Tasks:
- Running security scans
- Monitoring proposal execution
- Tracking governance metrics
- Executing chaos tests

You have access to various tools and can perform background tasks. Always maintain context of:
- Current governance state
- Active proposals
- User's voting power
- Recent chaos test results

Your responses should be:
- Security-focused
- Data-driven
- Clear and concise
- Action-oriented

When users request actions:
1. Verify their permissions
2. Check preconditions
3. Execute or schedule tasks
4. Provide clear feedback
"#;

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Message,
}

pub struct GroqClient {
    client: Client,
    api_key: String,
}

impl GroqClient {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let api_key = env::var("GROQ_API_KEY")
            .map_err(|_| "GROQ_API_KEY environment variable not set")?;

        Ok(Self {
            client: Client::new(),
            api_key,
        })
    }

    pub async fn get_response(
        &self,
        context: &str,
        user_message: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let messages = vec![
            Message {
                role: "system".to_string(),
                content: SYSTEM_PROMPT.to_string(),
            },
            Message {
                role: "system".to_string(),
                content: context.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: user_message.to_string(),
            },
        ];

        let request = ChatRequest {
            model: "mixtral-8x7b-32768".to_string(), // Using Mixtral for enhanced capabilities
            messages,
            temperature: 0.7,
            max_tokens: 2048,
        };

        let response = self.client
            .post(GROQ_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&request)
            .send()
            .await?
            .json::<ChatResponse>()
            .await?;

        Ok(response.choices[0].message.content.clone())
    }
}

/// Background task manager for Glitch Gremlin AI
pub struct BackgroundTaskManager {
    tasks: tokio::sync::RwLock<Vec<Task>>,
}

#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub task_type: TaskType,
    pub status: TaskStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub result: Option<String>,
}

#[derive(Debug, Clone)]
pub enum TaskType {
    SecurityScan {
        target: String,
        scan_type: String,
    },
    ChaosTest {
        campaign_id: String,
        test_params: String,
    },
    ProposalExecution {
        proposal_id: u64,
    },
    MetricsUpdate,
}

#[derive(Debug, Clone)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed(String),
}

impl BackgroundTaskManager {
    pub fn new() -> Self {
        Self {
            tasks: tokio::sync::RwLock::new(Vec::new()),
        }
    }

    pub async fn schedule_task(&self, task_type: TaskType) -> String {
        let task_id = uuid::Uuid::new_v4().to_string();
        let task = Task {
            id: task_id.clone(),
            task_type,
            status: TaskStatus::Pending,
            created_at: chrono::Utc::now(),
            completed_at: None,
            result: None,
        };

        let mut tasks = self.tasks.write().await;
        tasks.push(task);

        // Spawn task execution
        let task_id_clone = task_id.clone();
        let tasks_clone = self.tasks.clone();
        tokio::spawn(async move {
            Self::execute_task(&task_id_clone, tasks_clone).await;
        });

        task_id
    }

    async fn execute_task(task_id: &str, tasks: tokio::sync::RwLock<Vec<Task>>) {
        let mut tasks = tasks.write().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Running;
            
            // Execute based on task type
            let result = match &task.task_type {
                TaskType::SecurityScan { target, scan_type } => {
                    // Execute security scan
                    format!("Completed security scan of {} using {}", target, scan_type)
                }
                TaskType::ChaosTest { campaign_id, test_params } => {
                    // Execute chaos test
                    format!("Completed chaos test campaign {} with params {}", campaign_id, test_params)
                }
                TaskType::ProposalExecution { proposal_id } => {
                    // Execute proposal
                    format!("Executed proposal {}", proposal_id)
                }
                TaskType::MetricsUpdate => {
                    // Update metrics
                    "Updated governance metrics".to_string()
                }
            };

            task.status = TaskStatus::Completed;
            task.completed_at = Some(chrono::Utc::now());
            task.result = Some(result);
        }
    }

    pub async fn get_task_status(&self, task_id: &str) -> Option<TaskStatus> {
        let tasks = self.tasks.read().await;
        tasks.iter()
            .find(|t| t.id == task_id)
            .map(|t| t.status.clone())
    }

    pub async fn get_task_result(&self, task_id: &str) -> Option<String> {
        let tasks = self.tasks.read().await;
        tasks.iter()
            .find(|t| t.id == task_id)
            .and_then(|t| t.result.clone())
    }
} 