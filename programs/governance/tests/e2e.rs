#![cfg(test)]
use {
    anchor_lang::{prelude::*, solana_program::system_program},
    anchor_spl::token::{self, Token, TokenAccount, Mint},
    solana_program_test::*,
    solana_sdk::{
        signature::{Keypair, Signer},
        transaction::Transaction,
        transport::TransportError,
    },
    glitch_gremlin_program::{
        governance::{
            GovernanceParams,
            ProposalAction,
            ProposalState,
            ChaosParams,
            ChaosMode,
            DefenseLevel,
        },
        error::GovernanceError,
    },
    glitch_gremlin_program::allocator::{
        GremlinSecureAllocator,
        config::AllocatorConfig,
        monitor::AllocatorMonitor,
    },
    crate::test_config::TestConfig,
};

// Add before the TestContext struct
static ALLOCATOR: GremlinSecureAllocator = GremlinSecureAllocator::new(SecurityLevel::Maximum);

// Test utilities
pub struct TestContext {
    pub program: Program<'static, GlitchGremlinGovernance>,
    pub payer: Keypair,
    pub mint: Keypair,
    pub mint_authority: Keypair,
    pub governance: Pubkey,
    pub treasury: Pubkey,
    pub treasury_token_account: Pubkey,
    pub allocator_monitor: Arc<AllocatorMonitor>,
}

impl TestContext {
    pub async fn new() -> Self {
        Self::new_with_config(TestConfig::default()).await
    }

    pub async fn new_secure() -> Self {
        Self::new_with_config(TestConfig::new_secure()).await
    }

    pub async fn new_with_config(config: TestConfig) -> Self {
        // Initialize secure allocator monitor
        let allocator_monitor = Arc::new(AllocatorMonitor::new(Arc::new(config.allocator_config.clone())));

        // Initialize program test with secure allocator
        let mut program_test = ProgramTest::new(
            "glitch_gremlin_governance",
            id(),
            processor!(process_instruction),
        );

        // Configure test environment
        config.configure_program_test(&mut program_test);

        let mut context = program_test.start_with_context().await;
        let payer = context.payer.insecure_clone();
        
        // Create program client
        let program = anchor_client::Program::new(
            context.banks_client,
            context.payer,
            context.last_blockhash,
        );

        // Create mint and authority
        let mint = Keypair::new();
        let mint_authority = Keypair::new();

        // Initialize governance PDA
        let (governance, _) = Pubkey::find_program_address(
            &[b"governance"],
            &program.id(),
        );

        // Initialize treasury PDA
        let (treasury, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &program.id(),
        );

        // Create treasury token account
        let treasury_token_account = Keypair::new();

        Self {
            program,
            payer,
            mint,
            mint_authority,
            governance,
            treasury,
            treasury_token_account: treasury_token_account.pubkey(),
            allocator_monitor,
        }
    }

    // Helper to create a new proposal
    pub async fn create_proposal(
        &self,
        proposer: &Keypair,
        title: &str,
        description: &str,
        chaos_params: ChaosParams,
    ) -> Result<Pubkey, TransportError> {
        let proposal = Keypair::new();
        
        let ix = self.program
            .request()
            .accounts(CreateProposal {
                governance: self.governance,
                proposal: proposal.pubkey(),
                proposer: proposer.pubkey(),
                proposer_stake: get_stake_address(&proposer.pubkey()),
                stake_mint: self.mint.pubkey(),
                system_program: system_program::ID,
            })
            .args(create_proposal_ix {
                title: title.to_string(),
                description: description.to_string(),
                chaos_params,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, proposer], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await?;
        Ok(proposal.pubkey())
    }

    pub async fn initialize_with_authority(&self, authority: &Keypair) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(Initialize {
                governance: self.governance,
                payer: self.payer.pubkey(),
                system_program: system_program::ID,
            })
            .args(initialize_ix {
                authority: authority.pubkey(),
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn stake_tokens(&self, staker: &Keypair, amount: u64) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(StakeTokens {
                governance: self.governance,
                stake_info: get_stake_address(&staker.pubkey()),
                staker: staker.pubkey(),
                staker_token_account: get_token_address(&staker.pubkey()),
                stake_account: get_stake_token_address(&staker.pubkey()),
                stake_mint: self.mint.pubkey(),
                token_program: token::ID,
                system_program: system_program::ID,
            })
            .args(stake_tokens_ix {
                amount,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, staker], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn cast_vote(
        &self,
        voter: &Keypair,
        proposal: &Pubkey,
        support: bool,
    ) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(CastVote {
                proposal: *proposal,
                voter: voter.pubkey(),
                voter_stake: get_stake_address(&voter.pubkey()),
            })
            .args(cast_vote_ix {
                support,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, voter], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn execute_proposal(
        &self,
        executor: &Keypair,
        proposal: &Pubkey,
    ) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(ExecuteProposal {
                governance: self.governance,
                proposal: *proposal,
                treasury: self.treasury,
                executor: executor.pubkey(),
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, executor], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn emergency_halt(&self, authority: &Keypair) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(EmergencyAction {
                governance: self.governance,
                authority: authority.pubkey(),
            })
            .args(emergency_action_ix {
                action: EmergencyActionType::HaltProgram,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, authority], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn resume_program(&self, authority: &Keypair) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(EmergencyAction {
                governance: self.governance,
                authority: authority.pubkey(),
            })
            .args(emergency_action_ix {
                action: EmergencyActionType::ResumeProgram,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, authority], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn initialize_treasury(&self, authority: &Keypair) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(InitializeTreasury {
                governance: self.governance,
                treasury: self.treasury,
                treasury_token_account: self.treasury_token_account,
                authority: authority.pubkey(),
                token_program: token::ID,
                system_program: system_program::ID,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, authority], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn deposit_to_treasury(
        &self,
        authority: &Keypair,
        amount: u64,
    ) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(ManageTreasury {
                governance: self.governance,
                treasury: self.treasury,
                treasury_token_account: self.treasury_token_account,
                from_token_account: get_token_address(&authority.pubkey()),
                to_token_account: self.treasury_token_account,
                authority: authority.pubkey(),
                token_program: token::ID,
            })
            .args(manage_treasury_ix {
                action: TreasuryAction::Deposit,
                amount,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, authority], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    pub async fn withdraw_from_treasury(
        &self,
        authority: &Keypair,
        amount: u64,
    ) -> Result<(), TransportError> {
        let ix = self.program
            .request()
            .accounts(ManageTreasury {
                governance: self.governance,
                treasury: self.treasury,
                treasury_token_account: self.treasury_token_account,
                from_token_account: self.treasury_token_account,
                to_token_account: get_token_address(&authority.pubkey()),
                authority: authority.pubkey(),
                token_program: token::ID,
            })
            .args(manage_treasury_ix {
                action: TreasuryAction::Withdraw,
                amount,
            })
            .instructions()?[0]
            .clone();

        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.payer.pubkey()));
        tx.sign(&[&self.payer, authority], self.program.latest_blockhash);
        
        self.program.banks_client.process_transaction(tx).await
    }

    // Add helper method for monitoring allocator stats
    pub async fn check_allocator_safety(&self) -> Result<(), &'static str> {
        self.allocator_monitor.check_memory_safety(&ALLOCATOR).await
    }

    // Add method to run test with timeout
    pub async fn run_with_timeout<F, Fut>(&self, f: F) -> Result<(), &'static str>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<(), TransportError>>,
    {
        let timeout = TestConfig::default().test_timeout;
        tokio::time::timeout(timeout, f())
            .await
            .map_err(|_| "Test timed out")?
            .map_err(|_| "Test failed")
    }
}

#[tokio::test]
async fn test_initialize_governance() {
    let ctx = TestContext::new().await;
    
    // Initialize governance
    let authority = Keypair::new();
    let ix = ctx.program
        .request()
        .accounts(Initialize {
            governance: ctx.governance,
            payer: ctx.payer.pubkey(),
            system_program: system_program::ID,
        })
        .args(initialize_ix {
            authority: authority.pubkey(),
        })
        .instructions()?[0]
        .clone();

    let mut tx = Transaction::new_with_payer(&[ix], Some(&ctx.payer.pubkey()));
    tx.sign(&[&ctx.payer], ctx.program.latest_blockhash);
    
    ctx.program.banks_client.process_transaction(tx).await.unwrap();

    // Verify governance state
    let governance = ctx.program.account::<GovernanceState>(ctx.governance).await.unwrap();
    assert!(governance.is_initialized);
    assert_eq!(governance.authority, authority.pubkey());
}

#[tokio::test]
async fn test_stake_workflow() {
    let ctx = TestContext::new().await;
    let staker = Keypair::new();
    
    // Create stake account
    let stake_amount = 1_000_000;
    let ix = ctx.program
        .request()
        .accounts(StakeTokens {
            governance: ctx.governance,
            stake_info: get_stake_address(&staker.pubkey()),
            staker: staker.pubkey(),
            staker_token_account: get_token_address(&staker.pubkey()),
            stake_account: get_stake_token_address(&staker.pubkey()),
            stake_mint: ctx.mint.pubkey(),
            token_program: token::ID,
            system_program: system_program::ID,
        })
        .args(stake_tokens_ix {
            amount: stake_amount,
        })
        .instructions()?[0]
        .clone();

    let mut tx = Transaction::new_with_payer(&[ix], Some(&ctx.payer.pubkey()));
    tx.sign(&[&ctx.payer, &staker], ctx.program.latest_blockhash);
    
    ctx.program.banks_client.process_transaction(tx).await.unwrap();

    // Verify stake info
    let stake_info = ctx.program
        .account::<StakeInfo>(get_stake_address(&staker.pubkey()))
        .await
        .unwrap();
    assert_eq!(stake_info.staker, staker.pubkey());
    assert_eq!(stake_info.amount, stake_amount);
}

#[tokio::test]
async fn test_proposal_lifecycle() {
    let ctx = TestContext::new().await;
    let proposer = Keypair::new();
    
    // Create and stake tokens first
    let stake_amount = 5_000_000;
    ctx.stake_tokens(&proposer, stake_amount).await.unwrap();
    
    // Create proposal
    let chaos_params = ChaosParams {
        mode: ChaosMode::Controlled,
        target_program: Pubkey::new_unique(),
        duration: 1800,
        defense_level: DefenseLevel::High,
    };
    
    let proposal = ctx.create_proposal(
        &proposer,
        "Test Proposal",
        "Test Description",
        chaos_params,
    ).await.unwrap();

    // Cast votes
    let voter = Keypair::new();
    ctx.stake_tokens(&voter, stake_amount).await.unwrap();
    ctx.cast_vote(&voter, &proposal, true).await.unwrap();

    // Execute proposal
    ctx.execute_proposal(&proposer, &proposal).await.unwrap();

    // Verify final state
    let proposal_account = ctx.program.account::<Proposal>(proposal).await.unwrap();
    assert_eq!(proposal_account.state, ProposalState::Executed);
}

#[tokio::test]
async fn test_emergency_actions() {
    let ctx = TestContext::new().await;
    let authority = Keypair::new();
    
    // Initialize with authority
    ctx.initialize_with_authority(&authority).await.unwrap();
    
    // Test emergency halt
    ctx.emergency_halt(&authority).await.unwrap();
    
    // Verify halt state
    let governance = ctx.program.account::<GovernanceState>(ctx.governance).await.unwrap();
    assert!(governance.emergency_halt_active);
    
    // Test operations are blocked during halt
    let result = ctx.create_proposal(
        &Keypair::new(),
        "Test Proposal",
        "Should Fail",
        ChaosParams::default(),
    ).await;
    assert!(matches!(result, Err(GovernanceError::ProgramHalted)));
    
    // Resume program
    ctx.resume_program(&authority).await.unwrap();
    
    // Verify resumed state
    let governance = ctx.program.account::<GovernanceState>(ctx.governance).await.unwrap();
    assert!(!governance.emergency_halt_active);
}

#[tokio::test]
async fn test_treasury_management() {
    let ctx = TestContext::new().await;
    let authority = Keypair::new();
    
    // Initialize treasury
    ctx.initialize_treasury(&authority).await.unwrap();
    
    // Test deposit
    let amount = 1_000_000;
    ctx.deposit_to_treasury(&authority, amount).await.unwrap();
    
    // Verify treasury balance
    let governance = ctx.program.account::<GovernanceState>(ctx.governance).await.unwrap();
    assert_eq!(governance.treasury_balance, amount);
    
    // Test withdrawal
    ctx.withdraw_from_treasury(&authority, amount / 2).await.unwrap();
    
    // Verify updated balance
    let governance = ctx.program.account::<GovernanceState>(ctx.governance).await.unwrap();
    assert_eq!(governance.treasury_balance, amount / 2);
}

#[tokio::test]
async fn test_stake_delegation() {
    let ctx = TestContext::new().await;
    let staker = Keypair::new();
    let delegate = Keypair::new();
    
    // Stake tokens first
    let stake_amount = 1_000_000;
    ctx.stake_tokens(&staker, stake_amount).await.unwrap();
    
    // Delegate stake
    let ix = ctx.program
        .request()
        .accounts(DelegateStake {
            stake_info: get_stake_address(&staker.pubkey()),
            delegate_stake_info: get_stake_address(&delegate.pubkey()),
            staker: staker.pubkey(),
        })
        .instructions()?[0]
        .clone();

    let mut tx = Transaction::new_with_payer(&[ix], Some(&ctx.payer.pubkey()));
    tx.sign(&[&ctx.payer, &staker], ctx.program.latest_blockhash);
    
    ctx.program.banks_client.process_transaction(tx).await.unwrap();

    // Verify delegation
    let stake_info = ctx.program
        .account::<StakeInfo>(get_stake_address(&staker.pubkey()))
        .await
        .unwrap();
    assert_eq!(stake_info.delegated_to, Some(delegate.pubkey()));
}

#[tokio::test]
async fn test_proposal_voting_thresholds() {
    let ctx = TestContext::new().await;
    let proposer = Keypair::new();
    let voters: Vec<Keypair> = (0..5).map(|_| Keypair::new()).collect();
    
    // Initialize with custom thresholds
    let authority = Keypair::new();
    ctx.initialize_with_authority(&authority).await.unwrap();
    
    // Stake tokens for all participants
    let stake_amount = 1_000_000;
    ctx.stake_tokens(&proposer, stake_amount).await.unwrap();
    for voter in &voters {
        ctx.stake_tokens(voter, stake_amount).await.unwrap();
    }
    
    // Create proposal
    let proposal = ctx.create_proposal(
        &proposer,
        "Threshold Test",
        "Testing voting thresholds",
        ChaosParams::default(),
    ).await.unwrap();

    // Cast votes to not meet quorum
    for i in 0..2 {
        ctx.cast_vote(&voters[i], &proposal, true).await.unwrap();
    }

    // Try to execute (should fail due to insufficient quorum)
    let result = ctx.execute_proposal(&proposer, &proposal).await;
    assert!(matches!(result, Err(GovernanceError::QuorumNotReached)));

    // Cast more votes to meet quorum but not approval threshold
    for i in 2..4 {
        ctx.cast_vote(&voters[i], &proposal, false).await.unwrap();
    }

    // Try to execute (should fail due to insufficient approval)
    let result = ctx.execute_proposal(&proposer, &proposal).await;
    assert!(matches!(result, Err(GovernanceError::ApprovalThresholdNotMet)));
}

#[tokio::test]
async fn test_security_features() {
    let ctx = TestContext::new().await;
    let authority = Keypair::new();
    
    // Initialize with security settings
    ctx.initialize_with_authority(&authority).await.unwrap();
    
    // Test rate limiting
    let proposer = Keypair::new();
    ctx.stake_tokens(&proposer, 5_000_000).await.unwrap();
    
    // Create multiple proposals rapidly
    for i in 0..6 {
        let result = ctx.create_proposal(
            &proposer,
            &format!("Proposal {}", i),
            "Rate limit test",
            ChaosParams::default(),
        ).await;
        
        if i >= 5 {
            assert!(matches!(result, Err(GovernanceError::RateLimitExceeded)));
        } else {
            assert!(result.is_ok());
        }
    }

    // Test defense mode
    let ix = ctx.program
        .request()
        .accounts(EmergencyAction {
            governance: ctx.governance,
            authority: authority.pubkey(),
        })
        .args(emergency_action_ix {
            action: EmergencyActionType::EnableDefenseMode(DefenseLevel::Maximum),
        })
        .instructions()?[0]
        .clone();

    let mut tx = Transaction::new_with_payer(&[ix], Some(&ctx.payer.pubkey()));
    tx.sign(&[&ctx.payer, &authority], ctx.program.latest_blockhash);
    
    ctx.program.banks_client.process_transaction(tx).await.unwrap();

    // Verify defense mode restrictions
    let result = ctx.create_proposal(
        &proposer,
        "Should Fail",
        "Defense mode test",
        ChaosParams {
            mode: ChaosMode::Aggressive,
            target_program: Pubkey::new_unique(),
            duration: 3600,
            defense_level: DefenseLevel::None,
        },
    ).await;
    assert!(matches!(result, Err(GovernanceError::DefenseModeActive)));
}

#[tokio::test]
async fn test_chaos_parameters() {
    let ctx = TestContext::new().await;
    let proposer = Keypair::new();
    
    // Stake required tokens
    ctx.stake_tokens(&proposer, 5_000_000).await.unwrap();
    
    // Test invalid chaos parameters
    let result = ctx.create_proposal(
        &proposer,
        "Invalid Duration",
        "Testing parameter validation",
        ChaosParams {
            mode: ChaosMode::Controlled,
            target_program: Pubkey::new_unique(),
            duration: 7200, // Exceeds maximum allowed duration
            defense_level: DefenseLevel::Medium,
        },
    ).await;
    assert!(matches!(result, Err(GovernanceError::InvalidTestParameters)));

    // Test targeting protected program
    let result = ctx.create_proposal(
        &proposer,
        "Protected Target",
        "Testing program protection",
        ChaosParams {
            mode: ChaosMode::Controlled,
            target_program: ctx.governance, // Cannot target governance program
            duration: 1800,
            defense_level: DefenseLevel::Medium,
        },
    ).await;
    assert!(matches!(result, Err(GovernanceError::InvalidTargetProgram)));
}

#[tokio::test]
async fn test_multisig_authority() {
    let ctx = TestContext::new().await;
    let authority = Keypair::new();
    
    // Initialize with multisig configuration
    ctx.initialize_with_authority(&authority).await.unwrap();
    
    // Test emergency action without required signatures
    let unauthorized = Keypair::new();
    let result = ctx.emergency_halt(&unauthorized).await;
    assert!(matches!(result, Err(GovernanceError::UnauthorizedEmergencyAction)));
    
    // Test with proper multisig authority
    let action = EmergencyActionType::BlockAddress(Pubkey::new_unique());
    let signatures = vec![
        authority.sign_message(&action.try_to_vec().unwrap()),
        // Add more required signatures
    ];
    
    let ix = ctx.program
        .request()
        .accounts(EmergencyAction {
            governance: ctx.governance,
            authority: authority.pubkey(),
        })
        .args(emergency_action_ix {
            action,
            signatures: signatures.clone(),
        })
        .instructions()?[0]
        .clone();

    let mut tx = Transaction::new_with_payer(&[ix], Some(&ctx.payer.pubkey()));
    tx.sign(&[&ctx.payer, &authority], ctx.program.latest_blockhash);
    
    ctx.program.banks_client.process_transaction(tx).await.unwrap();
}

// Helper functions
fn get_stake_address(staker: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"stake_info", staker.as_ref()],
        &id(),
    ).0
}

fn get_token_address(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"token_account", owner.as_ref()],
        &id(),
    ).0
}

fn get_stake_token_address(staker: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"stake_token", staker.as_ref()],
        &id(),
    ).0
}

// Update test to use secure configuration
#[tokio::test]
async fn test_secure_allocator() {
    let ctx = TestContext::new_secure().await;
    
    ctx.run_with_timeout(|| async {
        // Test memory safety during normal operations
        let proposer = Keypair::new();
        ctx.stake_tokens(&proposer, 5_000_000).await?;
        
        // Verify allocator stats after stake
        ctx.check_allocator_safety().await.unwrap();
        let stats = ctx.allocator_monitor.get_stats().await;
        assert!(stats.total_allocations > 0);
        assert_eq!(stats.guard_violations, 0);
        
        // Create proposal to test more memory operations
        let proposal = ctx.create_proposal(
            &proposer,
            "Memory Test",
            "Testing secure memory operations",
            ChaosParams::default(),
        ).await?;
        
        // Verify memory safety after proposal creation
        ctx.check_allocator_safety().await.unwrap();
        let stats = ctx.allocator_monitor.get_stats().await;
        assert!(stats.total_allocations > 0);
        assert_eq!(stats.guard_violations, 0);
        
        // Test memory proof generation
        let proof = ALLOCATOR.prove_memory_safety().unwrap();
        assert!(ALLOCATOR.verify_memory_safety(&proof).unwrap());

        Ok(())
    }).await.unwrap();
}

// Add test for chaos mode
#[tokio::test]
async fn test_chaos_mode() {
    let config = TestConfig::default()
        .with_chaos_mode(true)
        .with_security_level(SecurityLevel::Maximum);
    
    let ctx = TestContext::new_with_config(config).await;
    
    ctx.run_with_timeout(|| async {
        // Test operations under chaos conditions
        let proposer = Keypair::new();
        ctx.stake_tokens(&proposer, 5_000_000).await?;
        
        // Create multiple proposals rapidly to trigger chaos
        for i in 0..5 {
            let result = ctx.create_proposal(
                &proposer,
                &format!("Chaos Test {}", i),
                "Testing under chaos conditions",
                ChaosParams {
                    mode: ChaosMode::Aggressive,
                    target_program: Pubkey::new_unique(),
                    duration: 1800,
                    defense_level: DefenseLevel::None,
                },
            ).await;
            
            // Under chaos mode, some operations may fail
            if result.is_err() {
                let stats = ctx.allocator_monitor.get_stats().await;
                assert!(stats.threshold_violations > 0 || stats.guard_violations > 0);
                return Ok(());
            }
        }
        
        Ok(())
    }).await.unwrap();
}

// Add new test for memory safety violations
#[tokio::test]
async fn test_memory_safety_violations() {
    let ctx = TestContext::new().await;
    let proposer = Keypair::new();
    
    // Test rapid allocations
    for _ in 0..100 {
        let result = ctx.stake_tokens(&proposer, 1_000_000).await;
        if result.is_err() {
            // Should fail when hitting memory limits
            let stats = ctx.allocator_monitor.get_stats().await;
            assert!(stats.threshold_violations > 0);
            return;
        }
    }
    
    // If we get here, memory limits weren't properly enforced
    panic!("Memory safety limits not enforced");
} 