use {
    anchor_lang::{prelude::*, solana_program::system_program},
    anchor_spl::{
        token::{self, Mint, Token, TokenAccount},
        associated_token::{AssociatedToken, get_associated_token_address},
    },
    glitch_gremlin_governance::{
        ChaosParams, ChaosMode, ChaosComplexity, DefenseLevel,
        GovernanceError, ProposalState, ProposalStatus,
        monitoring::{SecurityDashboard, SecurityMetrics, Alert, AlertSeverity},
    },
    nexus_zkvm::{
        NexusProver, ProofConfig, VerificationKey,
        runtime::Runtime as NexusRuntime,
    },
    libafl::{
        bolts::rands::StdRand,
        corpus::{InMemoryCorpus, OnDiskCorpus},
        feedbacks::{MaxMapFeedback, TimeFeedback},
        fuzzer::{Fuzzer, StdFuzzer},
        monitors::SimpleMonitor,
        mutators::scheduled::havoc_mutations,
        observers::{TimeObserver, HitcountsMapObserver},
        schedulers::{QueueScheduler, IndexesLenTimeMinimizerScheduler},
        stages::mutational::StdMutationalStage,
        state::StdState,
    },
    solana_program_test::*,
    solana_sdk::{
        signature::{Keypair, Signer},
        transaction::Transaction,
        transport::TransportError,
    },
    std::{
        sync::Arc,
        time::{Duration, SystemTime},
        path::Path,
    },
    crate::gremlin_config::{GremlinConfig, GremlinState},
};

#[derive(Clone)]
pub struct StakeAccounts {
    pub staker: Pubkey,
    pub stake_account: Pubkey,
    pub token_account: Pubkey,
    pub mint: Pubkey,
    pub system_program: Pubkey,
    pub token_program: Pubkey,
    pub associated_token_program: Pubkey,
    pub governance: Pubkey,
}

#[derive(Clone)]
pub struct ProposalAccounts {
    pub proposer: Pubkey,
    pub proposal: Pubkey,
    pub stake_account: Pubkey,
    pub treasury: Pubkey,
    pub system_program: Pubkey,
    pub token_program: Pubkey,
    pub governance: Pubkey,
}

fn stake_accounts(ctx: &TestContext, staker: &Keypair) -> StakeAccounts {
    let stake_account = Pubkey::find_program_address(
        &[
            b"stake",
            staker.pubkey().as_ref(),
        ],
        &ctx.program_id,
    ).0;

    let token_account = get_associated_token_address(
        &staker.pubkey(),
        &ctx.mint.pubkey(),
    );

    StakeAccounts {
        staker: staker.pubkey(),
        stake_account,
        token_account,
        mint: ctx.mint.pubkey(),
        system_program: system_program::ID,
        token_program: token::ID,
        associated_token_program: associated_token::ID,
        governance: ctx.governance,
    }
}

fn proposal_accounts(ctx: &TestContext, proposer: &Keypair) -> ProposalAccounts {
    let proposal = Pubkey::find_program_address(
        &[
            b"proposal",
            proposer.pubkey().as_ref(),
            &Clock::get().unwrap().unix_timestamp.to_le_bytes(),
        ],
        &ctx.program_id,
    ).0;

    let stake_account = Pubkey::find_program_address(
        &[
            b"stake",
            proposer.pubkey().as_ref(),
        ],
        &ctx.program_id,
    ).0;

    ProposalAccounts {
        proposer: proposer.pubkey(),
        proposal,
        stake_account,
        treasury: ctx.treasury,
        system_program: system_program::ID,
        token_program: token::ID,
        governance: ctx.governance,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct StakeInstruction {
    amount: u64,
}

fn stake_instruction(amount: u64) -> StakeInstruction {
    StakeInstruction {
        amount,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct CreateProposalInstruction {
    stake_amount: u64,
    chaos_params: ChaosParams,
}

fn create_proposal_instruction(stake: u64, params: ChaosParams) -> CreateProposalInstruction {
    CreateProposalInstruction {
        stake_amount: stake,
        chaos_params: params,
    }
}

// AI Integration
struct GroqClient {
    api_key: String,
}

impl GroqClient {
    fn new(api_key: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
        }
    }

    async fn analyze_program(
        &self,
        program_id: Pubkey,
        prompt: &str,
    ) -> Result<ProgramAnalysis> {
        // Initialize Groq API client
        let client = reqwest::Client::new();
        
        // Prepare analysis request
        let request = json!({
            "model": "mixtral-8x7b-32768",
            "messages": [
                {
                    "role": "system",
                    "content": "You are an AI security expert analyzing Solana programs for vulnerabilities"
                },
                {
                    "role": "user",
                    "content": format!(
                        "Analyze the following Solana program for potential vulnerabilities and attack vectors: {}. {}",
                        program_id,
                        prompt
                    )
                }
            ],
            "temperature": 0.7,
            "max_tokens": 2000
        });

        // Send request to Groq API
        let response = client
            .post("https://api.groq.com/v1/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&request)
            .send()
            .await?;

        // Parse response
        let analysis: ProgramAnalysis = response.json().await?;
        Ok(analysis)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ProgramAnalysis {
    attack_vectors: Vec<AttackVector>,
    risk_level: RiskLevel,
    recommendations: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AttackVector {
    name: String,
    description: String,
    severity: Severity,
    test_strategy: String,
}

#[derive(Debug, Clone, Deserialize)]
enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Deserialize)]
enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

// Fuzzing Extensions
impl StdFuzzer<...> {
    fn generate_test_case(
        &self,
        attack_vector: AttackVector,
        complexity: u8,
    ) -> Result<TestCase> {
        let mut test_case = TestCase::default();
        
        // Generate input based on attack vector
        match attack_vector.name.as_str() {
            "reentrancy" => {
                test_case.inputs.push(FuzzInput::Transaction(
                    generate_reentrant_transaction(complexity)
                ));
            },
            "integer_overflow" => {
                test_case.inputs.push(FuzzInput::Value(
                    generate_overflow_value(complexity)
                ));
            },
            "data_validation" => {
                test_case.inputs.push(FuzzInput::AccountData(
                    generate_invalid_data(complexity)
                ));
            },
            _ => {
                test_case.inputs.push(FuzzInput::Random(
                    generate_random_input(complexity)
                ));
            }
        }

        Ok(test_case)
    }

    fn execute_test(
        &mut self,
        test_case: TestCase,
        duration: u64,
        defense_level: DefenseLevel,
    ) -> Result<TestResult> {
        let start_time = SystemTime::now();
        let mut result = TestResult::default();

        while SystemTime::now().duration_since(start_time)?.as_secs() < duration {
            // Execute test inputs
            for input in &test_case.inputs {
                let execution = self.execute_input(input, defense_level)?;
                
                if let Some(finding) = execution.finding {
                    result.findings.push(finding);
                }
                
                if execution.should_stop {
                    break;
                }
            }

            // Mutate inputs for next iteration
            self.mutate_test_case(&mut test_case)?;
        }

        Ok(result)
    }
}

// Enhanced TestContext with monitoring capabilities
pub struct TestContext {
    pub program: Program<'static, GlitchGremlinGovernance>,
    pub program_id: Pubkey,
    pub payer: Keypair,
    pub mint: Keypair,
    pub mint_authority: Keypair,
    pub token: Token,
    pub governance: Pubkey,
    pub treasury: Pubkey,
    pub nexus_runtime: Arc<NexusRuntime>,
    pub fuzzer: StdFuzzer<
        InMemoryCorpus,
        OnDiskCorpus,
        StdState<
            HitcountsMapObserver,
            TimeObserver,
            MaxMapFeedback,
            TimeFeedback,
        >,
        QueueScheduler,
        StdRand,
    >,
    pub gremlin_state: Arc<RwLock<GremlinState>>,
    pub security_dashboard: Arc<RwLock<SecurityDashboard>>,
    pub monitoring_interval: Duration,
}

impl TestContext {
    pub async fn new(
        banks_client: &mut BanksClient,
        payer: Keypair,
        recent_blockhash: Hash,
    ) -> Result<Self> {
        // Initialize base components
        let program_id = id();
        let program = anchor_lang::Program::new("glitch_gremlin_governance", program_id);
        
        // Initialize token components
        let mint = Keypair::new();
        let mint_authority = Keypair::new();
        
        // Create PDAs
        let (governance, _) = Pubkey::find_program_address(
            &[b"governance"],
            &program_id,
        );
        
        let (treasury, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &program_id,
        );

        // Initialize Nexus Runtime with enhanced security
        let nexus_runtime = Arc::new(NexusRuntime::new()?);
        nexus_runtime.enable_security_features(SecurityLevel::High)?;

        // Initialize LibAFL components with advanced configuration
        let monitor = SimpleMonitor::new(|x| println!("[LibAFL] {}", x));
        let observer = HitcountsMapObserver::new("coverage");
        let time_observer = TimeObserver::new("execution_time");
        
        let feedback = MaxMapFeedback::new(&monitor);
        let time_feedback = TimeFeedback::new(&monitor);
        
        let state = StdState::new(
            InMemoryCorpus::new(),
            OnDiskCorpus::new(Path::new("./fuzzing/crashes"))?,
            &observer,
            &time_observer,
            feedback,
            time_feedback,
            &monitor,
        )?;

        let scheduler = QueueScheduler::new();
        let rand = StdRand::with_seed(SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos() as u64);

        let fuzzer = StdFuzzer::new(state, scheduler, rand);

        // Initialize Gremlin State
        let gremlin_state = Arc::new(RwLock::new(GremlinState::new()));

        // Initialize enhanced monitoring
        let security_dashboard = Arc::new(RwLock::new(
            SecurityDashboard::new_with_gremlin(
                program_id,
                "./monitoring/dashboard.db",
                gremlin_state.clone(),
            )?
        ));

        // Setup monitoring interval
        let monitoring_interval = Duration::from_secs(30);

        Ok(Self {
            program,
            program_id,
            payer,
            mint,
            mint_authority,
            token: Token {},
            governance,
            treasury,
            nexus_runtime,
            fuzzer,
            gremlin_state,
            security_dashboard,
            monitoring_interval,
        })
    }

    // Add Gremlin-specific monitoring
    async fn monitor_gremlin_activity(&self) -> Result<()> {
        let gremlin = self.gremlin_state.read().await;
        let metrics = &gremlin.metrics;

        // Check test success rate
        let success_rate = metrics.successful_tests as f64 
            / metrics.total_tests_run.max(1) as f64;
            
        if success_rate < 0.8 {
            println!("WARNING: Low test success rate: {:.2}%", success_rate * 100.0);
        }

        // Monitor finding distribution
        let critical_ratio = metrics.critical_findings as f64 
            / metrics.total_findings.max(1) as f64;
            
        if critical_ratio > 0.2 {  // More than 20% critical findings
            println!("ALERT: High ratio of critical findings: {:.2}%", critical_ratio * 100.0);
        }

        // Resource usage monitoring
        let avg_compute_per_test = metrics.total_compute_units_used as f64 
            / metrics.total_tests_run.max(1) as f64;
            
        if avg_compute_per_test > MAX_COMPUTE_UNITS as f64 * 0.8 {
            println!("WARNING: High average compute usage: {} units", avg_compute_per_test);
        }

        Ok(())
    }

    // Enhanced test execution with Gremlin metrics
    async fn execute_chaos_test(
        &mut self,
        params: &ChaosParams,
        ai_analysis: &ProgramAnalysis,
    ) -> Result<TestResult> {
        let mut gremlin = self.gremlin_state.write().await;
        
        // Validate test parameters
        gremlin.validate_test_params(params).await?;
        
        println!("Executing chaos test with parameters: {:?}", params);
        let start_time = SystemTime::now();

        // Initialize test vectors based on AI analysis
        let test_vectors = generate_test_vectors(ai_analysis)?;
        let mut test_result = TestResult::default();
        
        // Execute each test vector with enhanced monitoring
        for vector in test_vectors {
            println!("Testing attack vector: {}", vector.name);
            
            // Generate test case with Gremlin configuration
            let test_case = self.fuzzer.generate_test_case(
                vector.clone(),
                params.complexity.into(),
            )?;

            // Execute with comprehensive monitoring
            let execution = self.execute_with_monitoring(
                test_case,
                params.defense_level,
            ).await?;

            // Record findings and update metrics
            if let Some(finding) = execution.finding {
                test_result.findings.push(finding.clone());
                gremlin.record_finding(finding).await?;
                
                // Generate proof for critical findings
                if finding.severity >= Severity::High {
                    let proof = self.nexus_runtime.prove_finding(
                        "critical_finding",
                        finding,
                    )?;
                    test_result.proofs.push(proof);
                }
            }

            // Update Gremlin metrics
            gremlin.metrics.total_tests_run += 1;
            if execution.success {
                gremlin.metrics.successful_tests += 1;
            } else {
                gremlin.metrics.failed_tests += 1;
            }

            // Check execution time and adjust if needed
            if SystemTime::now().duration_since(start_time)?.as_secs() >= params.duration {
                break;
            }
        }

        // Update final metrics
        gremlin.metrics.average_test_duration = SystemTime::now()
            .duration_since(start_time)?
            .as_secs_f64();

        test_result.metrics = self.security_dashboard.read().await.get_test_metrics()?;
        test_result.success = test_result.findings.iter()
            .all(|f| f.severity < Severity::Critical);

        Ok(test_result)
    }

    // Execute test case with resource monitoring
    async fn execute_with_monitoring(
        &self,
        test_case: TestCase,
        defense_level: DefenseLevel,
    ) -> Result<TestExecution> {
        let mut dashboard = self.security_dashboard.write().await;
        
        // Start resource monitoring
        let monitor_handle = dashboard.start_monitoring()?;
        
        // Execute test case
        let execution = self.fuzzer.execute_test(
            test_case,
            defense_level,
        )?;

        // Stop monitoring and get metrics
        let metrics = dashboard.stop_monitoring(monitor_handle)?;
        
        // Check resource usage
        if metrics.compute_units > MAX_COMPUTE_UNITS 
            || metrics.memory_bytes > MAX_MEMORY_BYTES {
            dashboard.record_resource_violation(metrics)?;
        }

        Ok(execution)
    }
}

// Helper functions for AI integration
fn derive_chaos_mode(analysis: &ProgramAnalysis) -> Result<ChaosMode> {
    match analysis.risk_level {
        RiskLevel::Critical => Ok(ChaosMode::Aggressive),
        RiskLevel::High => Ok(ChaosMode::Moderate),
        _ => Ok(ChaosMode::Conservative),
    }
}

fn derive_complexity(analysis: &ProgramAnalysis) -> Result<ChaosComplexity> {
    let attack_complexity = analysis.attack_vectors.iter()
        .map(|av| av.severity)
        .max()
        .unwrap_or(Severity::Low);
        
    match attack_complexity {
        Severity::Critical | Severity::High => Ok(ChaosComplexity::High),
        Severity::Medium => Ok(ChaosComplexity::Medium),
        Severity::Low => Ok(ChaosComplexity::Low),
    }
}

fn calculate_optimal_duration(analysis: &ProgramAnalysis) -> Result<u64> {
    // Calculate based on complexity and attack vectors
    let base_duration = 1800u64; // 30 minutes
    let complexity_multiplier = match analysis.risk_level {
        RiskLevel::Critical => 2.0,
        RiskLevel::High => 1.5,
        RiskLevel::Medium => 1.0,
        RiskLevel::Low => 0.5,
    };
    
    Ok((base_duration as f64 * complexity_multiplier) as u64)
}

fn derive_defense_level(analysis: &ProgramAnalysis) -> Result<DefenseLevel> {
    match analysis.risk_level {
        RiskLevel::Critical => Ok(DefenseLevel::Maximum),
        RiskLevel::High => Ok(DefenseLevel::High),
        RiskLevel::Medium => Ok(DefenseLevel::Medium),
        RiskLevel::Low => Ok(DefenseLevel::Low),
    }
}

fn generate_witness(result: &TestResult) -> Result<Vec<u8>> {
    // Generate witness for zero-knowledge proof
    let mut witness = Vec::new();
    witness.extend_from_slice(&result.success.to_le_bytes());
    witness.extend_from_slice(&result.execution_time.to_le_bytes());
    
    for finding in &result.findings {
        witness.extend_from_slice(&finding.serialize()?);
    }
    
    Ok(witness)
}

// Helper functions for AI-guided fuzzing
fn calculate_mutation_rate(severity: Severity) -> f64 {
    match severity {
        Severity::Critical => 0.8,
        Severity::High => 0.6,
        Severity::Medium => 0.4,
        Severity::Low => 0.2,
    }
}

fn severity_to_priority(severity: Severity) -> u32 {
    match severity {
        Severity::Critical => 4,
        Severity::High => 3,
        Severity::Medium => 2,
        Severity::Low => 1,
    }
}

fn calculate_required_hits(severity: Severity) -> u32 {
    match severity {
        Severity::Critical => 100,
        Severity::High => 50,
        Severity::Medium => 25,
        Severity::Low => 10,
    }
}

fn calculate_feedback_threshold(risk_level: RiskLevel) -> u32 {
    match risk_level {
        RiskLevel::Critical => 1000,
        RiskLevel::High => 500,
        RiskLevel::Medium => 250,
        RiskLevel::Low => 100,
    }
}

fn generate_ai_seed(analysis: &ProgramAnalysis) -> Result<u64> {
    use sha2::{Sha256, Digest};
    
    let mut hasher = Sha256::new();
    hasher.update(analysis.risk_level.to_string().as_bytes());
    
    for vector in &analysis.attack_vectors {
        hasher.update(vector.name.as_bytes());
        hasher.update(vector.severity.to_string().as_bytes());
    }
    
    let result = hasher.finalize();
    Ok(u64::from_le_bytes(result[0..8].try_into()?))
}

// Constants for resource limits
const MAX_COMPUTE_UNITS: u64 = 1_000_000;
const MAX_MEMORY_BYTES: u64 = 10 * 1024 * 1024; // 10MB

#[tokio::test]
async fn test_end_to_end_chaos_flow() -> Result<()> {
    // Initialize test environment with enhanced security
    let mut program_test = ProgramTest::new(
        "glitch_gremlin_governance",
        id(),
        processor!(process_instruction),
    );

    // Configure test validator with security features
    program_test.set_compute_max_units(MAX_COMPUTE_UNITS);
    program_test.add_program("glitch_gremlin_governance", program_id, None);

    // Start test validator with monitoring
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Initialize test context with enhanced monitoring
    let mut ctx = TestContext::new(&mut banks_client, payer, recent_blockhash).await?;
    
    // Start security monitoring in background
    let monitoring_handle = tokio::spawn({
        let ctx = ctx.clone();
        async move {
            loop {
                if let Err(e) = ctx.monitor_gremlin_activity().await {
                    println!("Gremlin monitoring error: {}", e);
                }
                tokio::time::sleep(ctx.monitoring_interval).await;
            }
        }
    });

    println!("Starting end-to-end test with enhanced Gremlin monitoring...");

    // 1. Initialize Groq AI client with retry mechanism
    let groq_client = GroqClient::new_with_retries(
        std::env::var("GROQ_API_KEY")?,
        3, // max retries
        Duration::from_secs(1), // retry delay
    );

    // 2. Stake Tokens with monitoring and validation
    println!("Testing token staking with security validation...");
    let staker = Keypair::new();
    let stake_amount = TEST_STAKE_AMOUNT;
    
    // Validate stake amount
    require!(
        stake_amount >= MIN_STAKE_AMOUNT,
        GovernanceError::InsufficientStakeAmount
    );
    
    let stake_tx = ctx.program
        .request()
        .accounts(stake_accounts(&ctx, &staker))
        .args(stake_instruction(stake_amount))
        .sign(&[&staker])?;
    
    // Monitor stake transaction with enhanced metrics
    let stake_result = banks_client.process_transaction(stake_tx).await;
    ctx.security_dashboard.write().await.record_transaction(
        TransactionRecord {
            tx_type: "stake".to_string(),
            success: stake_result.is_ok(),
            amount: stake_amount,
            timestamp: Clock::get()?.unix_timestamp,
            metrics: Some(ResourceMetrics {
                compute_units_used: 0, // Will be filled by monitor
                memory_bytes_used: 0,
            }),
        },
    )?;

    // 3. Initialize AI-powered testing
    println!("Initializing AI-powered testing components...");
    
    // Get AI-optimized chaos parameters
    let target_program = Keypair::new().pubkey();
    let ai_analysis = groq_client.analyze_program_with_timeout(
        target_program,
        "Optimize chaos test parameters for maximum coverage and security",
        Duration::from_secs(30),
    ).await?;
    
    // Initialize fuzzing with AI guidance
    ctx.execute_chaos_test(
        &ChaosParams {
            mode: derive_chaos_mode(&ai_analysis)?,
            complexity: derive_complexity(&ai_analysis)?,
            duration: calculate_optimal_duration(&ai_analysis)?,
            target_program,
            defense_level: derive_defense_level(&ai_analysis)?,
        },
        &ai_analysis,
    ).await?;

    // 4. Create and Execute Proposal
    println!("Creating and executing governance proposal...");
    let proposer = Keypair::new();
    let proposal_stake = TEST_PROPOSAL_STAKE;
    
    // Create proposal with enhanced validation
    let create_proposal_tx = ctx.program
        .request()
        .accounts(proposal_accounts(&ctx, &proposer))
        .args(create_proposal_instruction(proposal_stake, ChaosParams {
            mode: derive_chaos_mode(&ai_analysis)?,
            complexity: derive_complexity(&ai_analysis)?,
            duration: calculate_optimal_duration(&ai_analysis)?,
            target_program,
            defense_level: derive_defense_level(&ai_analysis)?,
        }))
        .sign(&[&proposer])?;
    
    // Monitor proposal creation with detailed metrics
    let proposal_result = banks_client.process_transaction(create_proposal_tx).await;
    ctx.security_dashboard.write().await.record_transaction(
        TransactionRecord {
            tx_type: "create_proposal".to_string(),
            success: proposal_result.is_ok(),
            amount: proposal_stake,
            timestamp: Clock::get()?.unix_timestamp,
            params: Some(ChaosParams {
                mode: derive_chaos_mode(&ai_analysis)?,
                complexity: derive_complexity(&ai_analysis)?,
                duration: calculate_optimal_duration(&ai_analysis)?,
                target_program,
                defense_level: derive_defense_level(&ai_analysis)?,
            }),
            metrics: None, // Will be filled by monitor
        },
    )?;

    // 5. Execute Chaos Test with comprehensive monitoring
    println!("Executing AI-powered chaos test with enhanced monitoring...");
    let test_result = ctx.execute_chaos_test(
        &ChaosParams {
            mode: derive_chaos_mode(&ai_analysis)?,
            complexity: derive_complexity(&ai_analysis)?,
            duration: calculate_optimal_duration(&ai_analysis)?,
            target_program,
            defense_level: derive_defense_level(&ai_analysis)?,
        },
        &ai_analysis,
    ).await?;

    // 6. Generate and verify Zero-Knowledge Proof with enhanced security
    println!("Generating zkProof with enhanced verification...");
    let witness = generate_witness(&test_result)?;
    
    let proof = ctx.nexus_runtime.prove_with_params(
        "chaos_test",
        test_result.clone(),
        witness,
        ProofParams {
            security_level: 128,
            hash_function: "poseidon".to_string(),
            verification_key: Some(VerificationKey::generate()?),
        },
    )?;

    // 7. Verify Results and Generate Comprehensive Report
    println!("Verifying test results and generating detailed report...");
    assert!(proof.verify_with_params(&ProofParams::default())?);
    
    let security_report = ctx.security_dashboard.read().await.generate_security_report(
        SecurityReportParams {
            test_result: test_result.clone(),
            ai_analysis: ai_analysis.clone(),
            proof: Some(proof),
            execution_metrics: ctx.get_execution_metrics().await?,
        },
    )?;

    // Print detailed test results
    println!("\nComprehensive Test Results:");
    println!("===========================");
    println!("Test Execution:");
    println!("- Total Transactions: {}", security_report.total_transactions);
    println!("- Success Rate: {:.2}%", security_report.success_rate * 100.0);
    println!("- Average Response Time: {}ms", security_report.avg_response_time);
    
    println!("\nSecurity Metrics:");
    println!("- Vulnerabilities Found: {}", security_report.vulnerabilities.len());
    println!("- Security Score: {}/100", security_report.security_score);
    println!("- Resource Usage: {:.2}%", security_report.resource_usage_percentage);
    
    println!("\nAI Analysis:");
    println!("- Risk Level: {:?}", ai_analysis.risk_level);
    println!("- Attack Vectors Tested: {}", ai_analysis.attack_vectors.len());
    
    println!("\nRecommendations:");
    for (i, rec) in security_report.ai_recommendations.iter().enumerate() {
        println!("{}. {}", i + 1, rec);
    }

    // Cleanup and shutdown monitoring
    monitoring_handle.abort();
    ctx.cleanup().await?;
    
    println!("End-to-end test completed successfully!");
    Ok(())
} 