use anchor_lang::prelude::*;
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    sysvar::clock::Clock,
    pubkey::Pubkey,
};
use solana_sdk::account::Account;
use super::{ChaosTestResult, Finding, FindingSeverity, FindingCategory, ChaosError};
use crate::state::{Proposal, ProposalState, Vote};
use std::{collections::HashMap, thread::sleep, time::Duration};
use solana_program::rpc_client::RpcClient;
use solana_program::rpc_client::RpcProgramAccountsConfig;
use solana_program::rpc_client::RpcAccountInfoConfig;
use solana_program::rpc_client::UiAccountEncoding;
use solana_client::{
    rpc_client::RpcClient,
    rpc_config::{RpcProgramAccountsConfig, RpcAccountInfoConfig},
    rpc_filter::{RpcFilterType, Memcmp, MemcmpEncodedBytes},
};
use solana_sdk::commitment_config::CommitmentConfig;
use crate::state::{StakeAccount, StakeOperation, StakeOperationType};
use crate::error::{GovernanceError, Result, ErrorContext, create_error_context};
use anchor_lang::Discriminator;

const ANOMALY_THRESHOLD_LAMPORTS: u64 = 1_000_000; // 0.001 SOL
const HIGH_COST_THRESHOLD: u64 = 200_000; // Lamports
const CRITICAL_COST_THRESHOLD: u64 = 100_000_000; // 0.1 SOL
const MAX_CONCURRENT_TXS: u64 = 5;
const CONCURRENT_TX_WINDOW_SECS: i64 = 2;
const STAKE_CONCENTRATION_THRESHOLD: f64 = 0.5; // 50%
const CONCURRENT_TXS_THRESHOLD: u64 = 100;
const SUSPICIOUS_VOTE_PATTERN_THRESHOLD: u64 = 10;

pub fn collect_test_results(
    target_program: &Pubkey,
    test_result: ChaosTestResult,
) -> Result<ChaosTestResult> {
    let mut enhanced_findings = test_result.findings;
    let mut enhanced_errors = test_result.errors;

    // Analyze program state after test
    if let Some(state_findings) = analyze_program_state(target_program)? {
        enhanced_findings.extend(state_findings);
    }

    // Analyze resource usage
    if let Some(resource_finding) = analyze_resource_usage(
        target_program,
        test_result.lamports_spent,
        test_result.transactions_processed,
    )? {
        enhanced_findings.push(resource_finding);
    }

    // Check for concurrent execution issues
    if let Some(concurrency_findings) = check_concurrency_issues(target_program)? {
        enhanced_findings.extend(concurrency_findings);
    }

    // Analyze error patterns
    if let Some(error_findings) = analyze_error_patterns(&enhanced_errors)? {
        enhanced_findings.extend(error_findings);
    }

    Ok(ChaosTestResult {
        success: test_result.success && enhanced_findings.iter().all(|f| f.severity != FindingSeverity::Critical),
        findings: enhanced_findings,
        errors: enhanced_errors,
        transactions_processed: test_result.transactions_processed,
        lamports_spent: test_result.lamports_spent,
    })
}

fn analyze_program_state(program_id: &Pubkey) -> Result<Option<Vec<Finding>>> {
    let mut findings = Vec::new();
    
    // Check program data consistency
    if let Some(inconsistency) = check_data_consistency(program_id)? {
        findings.push(Finding::new(
            FindingCategory::DataInconsistency,
            FindingSeverity::High,
            format!("Data inconsistency detected: {}", inconsistency),
            *program_id,
            None,
        ));
    }

    // Check for unauthorized state modifications
    if let Some(unauthorized_mod) = check_unauthorized_modifications(program_id)? {
        findings.push(Finding::new(
            FindingCategory::SecurityVulnerability,
            FindingSeverity::Critical,
            format!("Unauthorized state modification: {}", unauthorized_mod),
            *program_id,
            None,
        ));
    }

    if findings.is_empty() {
        Ok(None)
    } else {
        Ok(Some(findings))
    }
}

fn analyze_resource_usage(
    program_id: &Pubkey,
    lamports_spent: u64,
    transactions_processed: u64,
) -> Result<Option<Finding>> {
    let avg_cost = if transactions_processed > 0 {
        lamports_spent / transactions_processed
    } else {
        0
    };

    if avg_cost > CRITICAL_COST_THRESHOLD {
        Ok(Some(Finding::new(
            FindingCategory::PerformanceIssue,
            FindingSeverity::Critical,
            format!(
                "Critical resource usage: Average cost per transaction {} lamports",
                avg_cost
            ),
            *program_id,
            None,
        )))
    } else if avg_cost > HIGH_COST_THRESHOLD {
        Ok(Some(Finding::new(
            FindingCategory::PerformanceIssue,
            FindingSeverity::High,
            format!(
                "High resource usage: Average cost per transaction {} lamports",
                avg_cost
            ),
            *program_id,
            None,
        )))
    } else if avg_cost > ANOMALY_THRESHOLD_LAMPORTS {
        Ok(Some(Finding::new(
            FindingCategory::PerformanceIssue,
            FindingSeverity::Medium,
            format!(
                "Elevated resource usage: Average cost per transaction {} lamports",
                avg_cost
            ),
            *program_id,
            None,
        )))
    } else {
        Ok(None)
    }
}

fn check_concurrency_issues(program_id: &Pubkey) -> Result<Option<Vec<Finding>>> {
    let mut findings = Vec::new();
    let clock = Clock::get()?;
    
    // Get recent transactions for the program
    let recent_txs = get_recent_transactions(program_id, clock.unix_timestamp)?;
    
    // Check for transaction clustering
    if let Some(cluster_finding) = check_transaction_clustering(&recent_txs)? {
        findings.push(cluster_finding);
    }
    
    // Check for parallel state modifications
    if let Some(state_finding) = check_parallel_state_modifications(program_id, &recent_txs)? {
        findings.push(state_finding);
    }
    
    // Check for account locking patterns
    if let Some(lock_finding) = check_account_locking_patterns(program_id)? {
        findings.push(lock_finding);
    }

    if findings.is_empty() {
        Ok(None)
    } else {
        Ok(Some(findings))
    }
}

fn get_recent_transactions(program_id: &Pubkey, current_time: i64) -> Result<Vec<(i64, Signature)>> {
    // For now, we'll use a simplified version that looks at the last few slots
    // In a full implementation, this would query the recent transaction history
    
    Ok(vec![])
}

fn check_transaction_clustering(recent_txs: &[(i64, Signature)]) -> Result<Option<Finding>> {
    let mut time_windows = std::collections::HashMap::new();
    
    // Group transactions by time windows
    for (timestamp, _) in recent_txs {
        let window = timestamp / CONCURRENT_TX_WINDOW_SECS;
        *time_windows.entry(window).or_insert(0) += 1;
    }
    
    // Check for windows with too many transactions
    for (window, count) in time_windows {
        if count > MAX_CONCURRENT_TXS {
            return Ok(Some(Finding {
                severity: FindingSeverity::High,
                category: FindingCategory::ConcurrencyIssue,
                description: format!(
                    "High transaction density detected: {} transactions in {} second window",
                    count,
                    CONCURRENT_TX_WINDOW_SECS
                ),
                transaction_signature: None,
            }));
        }
    }
    
    Ok(None)
}

fn check_parallel_state_modifications(
    program_id: &Pubkey,
    recent_txs: &[(i64, Signature)]
) -> Result<Option<Finding>> {
    let mut state_versions = std::collections::HashMap::new();
    let mut concurrent_mods = 0;
    
    for (timestamp, _) in recent_txs {
        let window = timestamp / CONCURRENT_TX_WINDOW_SECS;
        let version = state_versions.entry(window).or_insert(0);
        *version += 1;
        
        if *version > 1 {
            concurrent_mods += 1;
        }
    }
    
    if concurrent_mods > 0 {
        Ok(Some(Finding {
            severity: FindingSeverity::High,
            category: FindingCategory::ConcurrencyIssue,
            description: format!(
                "Detected {} potential parallel state modifications",
                concurrent_mods
            ),
            transaction_signature: None,
        }))
    } else {
        Ok(None)
    }
}

fn check_account_locking_patterns(program_id: &Pubkey) -> Result<Option<Finding>> {
    Ok(Some(Finding::new(
        FindingCategory::ConcurrencyIssue,
        FindingSeverity::Medium,
        *program_id,
        String::from("Recommend implementing explicit account locking for state modifications"),
        None,
    )))
}

fn analyze_error_patterns(errors: &[String]) -> Result<Option<Vec<Finding>>> {
    if errors.is_empty() {
        return Ok(None);
    }

    let mut findings = Vec::new();
    let mut error_counts = std::collections::HashMap::new();

    // Count error occurrences
    for error in errors {
        *error_counts.entry(error.clone()).or_insert(0) += 1;
    }

    // Analyze patterns
    for (error, count) in error_counts {
        if count > errors.len() as u32 / 2 {
            findings.push(Finding::new(
                FindingCategory::LogicError,
                FindingSeverity::High,
                *program_id,
                format!("Frequent error pattern detected: '{}' occurred {} times", error, count),
                None,
            ));
        }
    }

    if findings.is_empty() {
        Ok(None)
    } else {
        Ok(Some(findings))
    }
}

fn check_data_consistency(program_id: &Pubkey) -> Result<Option<String>> {
    let mut inconsistencies = Vec::new();
    
    // Check proposal state consistency
    if let Some(error) = check_proposal_state_consistency(program_id)? {
        inconsistencies.push(error);
    }
    
    // Check vote tallies
    if let Some(error) = check_vote_tally_consistency(program_id)? {
        inconsistencies.push(error);
    }
    
    // Check stake accounting
    if let Some(error) = check_stake_consistency(program_id)? {
        inconsistencies.push(error);
    }
    
    if inconsistencies.is_empty() {
        Ok(None)
    } else {
        Ok(Some(inconsistencies.join("; ")))
    }
}

fn check_proposal_state_consistency(program_id: &Pubkey) -> Result<Option<String>> {
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;
    let mut inconsistencies = Vec::new();

    // Get all active proposals
    let proposals = get_all_proposals(program_id)?;
    
    for proposal in proposals {
        // Check voting period consistency
        if proposal.state == ProposalState::Active {
            if current_time >= proposal.voting_ends_at {
                inconsistencies.push(format!(
                    "Proposal {} is still active but voting period has ended",
                    proposal.proposal_id
                ));
            }
        }
        
        // Check execution delay consistency
        if proposal.state == ProposalState::Succeeded && !proposal.executed {
            if current_time >= proposal.voting_ends_at + proposal.execution_delay 
                && current_time < proposal.voting_ends_at + proposal.execution_delay + 86400 {
                inconsistencies.push(format!(
                    "Proposal {} is in execution window but not executed",
                    proposal.proposal_id
                ));
            }
        }
        
        // Check vote tally consistency
        let votes = get_proposal_votes(&proposal.proposal_id)?;
        let (yes_votes, no_votes) = calculate_vote_totals(&votes);
        
        if yes_votes != proposal.yes_votes || no_votes != proposal.no_votes {
            inconsistencies.push(format!(
                "Vote tally mismatch for proposal {}: stored ({}, {}) vs calculated ({}, {})",
                proposal.proposal_id, proposal.yes_votes, proposal.no_votes, yes_votes, no_votes
            ));
        }
        
        // Check quorum and approval threshold
        let total_votes = yes_votes + no_votes;
        let total_possible_votes = get_total_staked_tokens(program_id)?;
        
        if proposal.state == ProposalState::Succeeded {
            let quorum_met = (total_votes * 100) >= (total_possible_votes * proposal.quorum_percentage as u64) / 100;
            let approval_met = (yes_votes * 100) >= (total_votes * proposal.approval_threshold_percentage as u64) / 100;
            
            if !quorum_met || !approval_met {
                inconsistencies.push(format!(
                    "Proposal {} marked as succeeded but does not meet quorum or approval requirements",
                    proposal.proposal_id
                ));
            }
        }
    }
    
    if inconsistencies.is_empty() {
        Ok(None)
    } else {
        Ok(Some(inconsistencies.join("; ")))
    }
}

fn get_all_proposals(program_id: &Pubkey) -> Result<Vec<Proposal>> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    let config = RpcProgramAccountsConfig {
        filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, vec![2]))]),
        account_config: RpcAccountInfoConfig {
            encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..RpcAccountInfoConfig::default()
        },
        ..RpcProgramAccountsConfig::default()
    };

    let accounts = rpc_client.get_program_accounts_with_config(program_id, config)?;
    
    accounts.into_iter()
        .filter_map(|(_, account)| Proposal::try_deserialize(&mut &account.data[..]).ok())
        .collect::<Vec<_>>()
}

fn get_proposal_votes(proposal_id: &Pubkey) -> Result<Vec<Vote>> {
    let mut votes = Vec::new();
    let vote_seed = &[b"vote", proposal_id.as_ref()];
    
    // Get all vote accounts associated with the proposal
    let (vote_pda, _) = Pubkey::find_program_address(vote_seed, &crate::ID);
    let accounts = solana_program::program_pack::Pack::unpack_unchecked(
        &vote_pda.to_bytes(),
        &[1; 32], // Filter for Vote discriminator
    )?;
    
    for (_, account) in accounts {
        if let Ok(vote) = Vote::try_from_slice(&account.data) {
            votes.push(vote);
        }
    }
    
    Ok(votes)
}

fn calculate_vote_totals(votes: &[Vote]) -> (u64, u64) {
    let mut yes_votes = 0;
    let mut no_votes = 0;
    
    for vote in votes {
        if vote.approve {
            yes_votes += vote.voting_power;
        } else {
            no_votes += vote.voting_power;
        }
    }
    
    (yes_votes, no_votes)
}

fn get_total_staked_tokens(program_id: &Pubkey) -> Result<u64> {
    let stake_seed = &[b"stake_pool"];
    let (stake_pool_pda, _) = Pubkey::find_program_address(stake_seed, program_id);
    
    // Get stake pool account
    let stake_pool_account = solana_program::account::get_account(
        &stake_pool_pda,
    )?;
    
    // Deserialize stake pool data
    let stake_pool = StakePool::try_from_slice(&stake_pool_account.data)?;
    
    Ok(stake_pool.total_staked)
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct StakePool {
    total_staked: u64,
}

pub fn get_program_accounts<'a>(
    program_id: &'a Pubkey,
    filters: &'a [RpcFilterType],
) -> Result<Vec<(Pubkey, AccountInfo<'a>)>> {
    let rpc_client = RpcClient::new(std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()));
    let config = RpcProgramAccountsConfig {
        filters: Some(filters.to_vec()),
        account_config: RpcAccountInfoConfig {
            encoding: Some(UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..Default::default()
        },
        ..Default::default()
    };

    let accounts = rpc_client.get_program_accounts_with_config(program_id, config)?;
    Ok(accounts.into_iter().map(|(pubkey, account)| {
        (pubkey, AccountInfo::new(
            &pubkey,
            false,
            false,
            &mut account.lamports,
            &mut account.data,
            &account.owner,
            account.executable,
            account.rent_epoch,
        ))
    }).collect())
}

pub async fn check_account_consistency(program_id: &Pubkey) -> Result<Option<Finding>> {
    let proposal_discriminator = Proposal::discriminator();
    let proposal_filter = Memcmp {
        offset: 0,
        bytes: MemcmpEncodedBytes::Base58(proposal_discriminator.to_vec()),
        encoding: None,
    };
    
    let accounts = get_program_accounts(program_id, &[RpcFilterType::Memcmp(proposal_filter)])?;
    
    for (proposal_pda, account) in accounts {
        if let Ok(proposal) = Proposal::try_deserialize(&mut &account.data.borrow()[..]) {
            if proposal.state != ProposalState::Active && !proposal.votes.is_empty() {
                return Ok(Some(Finding::new(
                    FindingCategory::DataInconsistency,
                    FindingSeverity::High,
                    *program_id,
                    format!("Inconsistent proposal state detected for {}", proposal_pda),
                    None,
                )));
            }
        }
    }
    
    Ok(None)
}

fn check_vote_tally_consistency(program_id: &Pubkey) -> Result<Option<String>> {
    let mut inconsistencies = Vec::new();
    
    // Get all proposals
    let proposals = get_all_proposals(program_id)?;
    
    for proposal in proposals {
        // Get all votes for this proposal
        let votes = get_proposal_votes(&proposal.proposal_id)?;
        let (calculated_yes, calculated_no) = calculate_vote_totals(&votes);
        
        // Compare with stored totals
        if calculated_yes != proposal.yes_votes {
            inconsistencies.push(format!(
                "Yes vote tally mismatch for proposal {}: stored={}, calculated={}",
                proposal.proposal_id, proposal.yes_votes, calculated_yes
            ));
        }
        
        if calculated_no != proposal.no_votes {
            inconsistencies.push(format!(
                "No vote tally mismatch for proposal {}: stored={}, calculated={}",
                proposal.proposal_id, proposal.no_votes, calculated_no
            ));
        }
        
        // Check for duplicate votes
        let mut voters = std::collections::HashSet::new();
        for vote in &votes {
            if !voters.insert(vote.voter) {
                inconsistencies.push(format!(
                    "Duplicate vote detected for voter {} in proposal {}",
                    vote.voter, proposal.proposal_id
                ));
            }
        }
        
        // Verify voting power against stake
        for vote in &votes {
            let voter_stake = get_voter_stake(program_id, &vote.voter)?;
            if vote.voting_power != voter_stake {
                inconsistencies.push(format!(
                    "Vote power mismatch for voter {} in proposal {}: vote power={}, actual stake={}",
                    vote.voter, proposal.proposal_id, vote.voting_power, voter_stake
                ));
            }
        }
    }
    
    if inconsistencies.is_empty() {
        Ok(None)
    } else {
        Ok(Some(inconsistencies.join("; ")))
    }
}

fn check_stake_consistency(program_id: &Pubkey) -> Result<Option<String>> {
    let mut inconsistencies = Vec::new();
    let total_staked = get_total_staked_tokens(program_id)?;
    let stake_accounts = get_all_stake_accounts(program_id)?;
    let mut calculated_total = 0;

    for stake in stake_accounts {
        calculated_total = calculated_total.checked_add(stake.amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        if stake.amount == 0 {
            inconsistencies.push(format!(
                "Empty stake account found for staker {}",
                stake.owner
            ));
        }

        let clock = Clock::get()?;
        if stake.locked_until > clock.unix_timestamp {
            if !stake.is_locked {
                inconsistencies.push(format!(
                    "Stake for {} should be locked until {} but is not marked as locked",
                    stake.owner, stake.locked_until
                ));
            }
        } else if stake.is_locked {
            inconsistencies.push(format!(
                "Stake for {} is marked as locked but lockup period has expired",
                stake.owner
            ));
        }
    }

    if calculated_total != total_staked {
        inconsistencies.push(format!(
            "Total stake mismatch: pool total={}, calculated total={}",
            total_staked, calculated_total
        ));
    }

    if inconsistencies.is_empty() {
        Ok(None)
    } else {
        Ok(Some(inconsistencies.join("; ")))
    }
}

fn get_voter_stake(program_id: &Pubkey, voter: &Pubkey) -> Result<u64> {
    let stake_seed = &[b"stake", voter.as_ref()];
    let (stake_pda, _) = Pubkey::find_program_address(stake_seed, program_id);
    
    // Get stake account
    let stake_account = solana_program::account::get_account(
        &stake_pda,
    )?;
    
    // Deserialize stake data
    let stake = StakeAccount::try_from_slice(&stake_account.data)?;
    
    Ok(stake.amount)
}

fn get_all_stake_accounts(program_id: &Pubkey) -> Result<Vec<StakeAccount>> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    let config = RpcProgramAccountsConfig {
        filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, vec![1]))]),
        account_config: RpcAccountInfoConfig {
            encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..RpcAccountInfoConfig::default()
        },
        ..RpcProgramAccountsConfig::default()
    };

    let accounts = rpc_client.get_program_accounts_with_config(program_id, config)?;
    Ok(accounts.into_iter()
        .filter_map(|(_, account)| StakeAccount::try_deserialize(&mut &account.data[..]).ok())
        .collect::<Vec<_>>())
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
#[account]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    pub last_update: i64,
    pub is_locked: bool,
    pub locked_until: i64,
}

// Constants for stake validation
pub const MIN_STAKE_DURATION: i64 = 7 * 24 * 60 * 60; // 7 days
pub const MAX_STAKE_DURATION: i64 = 365 * 24 * 60 * 60; // 1 year
pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 1 SOL in lamports

impl StakeAccount {
    pub const DISCRIMINATOR: [u8; 8] = [83, 84, 65, 75, 69, 65, 67, 84]; // "STAKEACT"

    pub fn validate(&self) -> Result<()> {
        require!(
            self.amount >= MIN_STAKE_AMOUNT,
            GovernanceError::InsufficientStake
        );
        
        if self.is_locked {
            let lock_duration = self.get_lock_duration()
                .ok_or(GovernanceError::InvalidProgramState)?;
                
            require!(
                lock_duration >= MIN_STAKE_DURATION && lock_duration <= MAX_STAKE_DURATION,
                GovernanceError::InvalidLockDuration
            );
        }
        Ok(())
    }

    pub fn can_withdraw(&self) -> Result<bool> {
        if !self.is_locked {
            return Ok(true);
        }
        
        let current_time = Clock::get()?.unix_timestamp;
        Ok(current_time >= self.locked_until)
    }

    pub fn update_stake(&mut self, new_amount: u64) -> Result<()> {
        require!(new_amount >= MIN_STAKE_AMOUNT, GovernanceError::InsufficientStake);
        
        self.amount = new_amount;
        self.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn lock_stake(&mut self, duration: i64) -> Result<()> {
        require!(
            duration >= MIN_STAKE_DURATION && duration <= MAX_STAKE_DURATION,
            GovernanceError::InvalidLockDuration
        );

        let current_time = Clock::get()?.unix_timestamp;
        self.is_locked = true;
        self.locked_until = current_time + duration;
        self.last_update = current_time;
        Ok(())
    }

    pub fn get_lock_duration(&self) -> Option<i64> {
        if self.is_locked {
            Clock::get().ok().map(|clock| {
                self.locked_until.saturating_sub(clock.unix_timestamp)
            })
        } else {
            None
        }
    }

    pub fn try_deserialize(data: &[u8]) -> Result<Self> {
        if data.len() < 8 || data[..8] != Self::DISCRIMINATOR {
            return Err(GovernanceError::InvalidProgramState);
        }
        
        let account: Self = AnchorDeserialize::deserialize(&mut &data[8..])
            .map_err(|_| GovernanceError::InvalidProgramState)?;
            
        account.validate()?;
        Ok(account)
    }
}

// Error codes specific to stake operations
#[error_code]
pub enum StakeError {
    #[msg("Insufficient stake amount")]
    InsufficientStake,
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    #[msg("Stake is currently locked")]
    StakeLocked,
    #[msg("Unauthorized stake operation")]
    UnauthorizedOperation,
}

fn check_unauthorized_modifications(program_id: &Pubkey) -> Result<Option<String>> {
    let mut unauthorized_mods = Vec::new();
    
    // Check for unauthorized proposal modifications
    if let Some(error) = check_proposal_modifications(program_id)? {
        unauthorized_mods.push(error);
    }
    
    // Check for unauthorized vote modifications
    if let Some(error) = check_vote_modifications(program_id)? {
        unauthorized_mods.push(error);
    }
    
    // Check for unauthorized stake modifications
    if let Some(error) = check_stake_modifications(program_id)? {
        unauthorized_mods.push(error);
    }
    
    if unauthorized_mods.is_empty() {
        Ok(None)
    } else {
        Ok(Some(unauthorized_mods.join("; ")))
    }
}

fn check_proposal_modifications(program_id: &Pubkey) -> Result<Option<String>> {
    // Check for modifications to finalized proposals
    // This is a placeholder for the actual implementation
    Ok(None)
}

fn check_vote_modifications(program_id: &Pubkey) -> Result<Option<String>> {
    // Check for modifications to cast votes
    // This is a placeholder for the actual implementation
    Ok(None)
}

fn check_stake_modifications(program_id: &Pubkey) -> Result<Option<String>> {
    let rpc_client = RpcClient::new(std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()));
    let stake_accounts = get_stake_accounts(&rpc_client, program_id)?;

    for stake in stake_accounts {
        if stake.is_locked {
            let lock_duration = stake.get_lock_duration().unwrap_or(0);
            if lock_duration > MAX_STAKE_DURATION {
                return Ok(Some(format!("Stake account {} has an invalid lock duration", stake.owner)));
            }
        }
    }

    Ok(None)
}

fn get_stake_accounts(rpc_client: &RpcClient, program_id: &Pubkey) -> Result<Vec<StakeAccount>> {
    let config = RpcProgramAccountsConfig {
        filters: Some(vec![
            RpcFilterType::Memcmp(Memcmp::new(
                0,
                MemcmpEncodedBytes::Base58(bs58::encode(&StakeAccount::DISCRIMINATOR).into_string()),
                None
            )),
        ]),
        account_config: RpcAccountInfoConfig {
            encoding: Some(UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..Default::default()
        },
        with_context: Some(true),
    };

    let accounts = rpc_client
        .get_program_accounts_with_config(program_id, config)
        .map_err(|_| GovernanceError::ClientError)
        .with_context("Failed to fetch stake accounts")?;

    accounts
        .into_iter()
        .filter_map(|(_, account)| {
            StakeAccount::try_deserialize(&account.data).ok()
        })
        .collect::<Vec<_>>()
        .pipe(Ok)
}

pub async fn monitor_execution_anomalies(
    program_id: &Pubkey,
    findings: &mut Vec<Finding>
) -> Result<()> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    // Monitor transaction costs
    let recent_txs = rpc_client.get_signatures_for_address(program_id)?;
    let mut total_cost = 0u64;
    let mut high_cost_txs = 0u64;
    let mut tx_patterns = HashMap::new();

    for sig_info in recent_txs {
        if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, None) {
            let cost = tx.meta.unwrap().fee;
            total_cost = total_cost.checked_add(cost)
                .ok_or_else(|| ProgramError::from(ErrorCode::ArithmeticOverflow))?;
            
            // Analyze transaction patterns
            let accounts = tx.transaction.message.account_keys;
            for (i, account) in accounts.iter().enumerate() {
                tx_patterns.entry(account)
                    .and_modify(|e: &mut Vec<(u64, i64)>| e.push((cost, sig_info.block_time.unwrap_or(0))))
                    .or_insert_with(|| vec![(cost, sig_info.block_time.unwrap_or(0))]);
            }
            
            if cost > HIGH_COST_THRESHOLD {
                high_cost_txs += 1;
                let mut finding = Finding::new(
                    "High Transaction Cost".to_string(),
                    format!("Transaction cost of {} lamports exceeds threshold", cost),
                    FindingSeverity::High,
                    FindingCategory::PerformanceIssue,
                    *program_id,
                    Some(sig_info.signature.to_string()),
                );
                finding.add_metadata("cost".to_string(), cost.to_string());
                finding.add_metadata("threshold".to_string(), HIGH_COST_THRESHOLD.to_string());
                findings.push(finding);
            }
        }
    }

    // Analyze transaction patterns for potential attacks
    for (account, patterns) in tx_patterns {
        if patterns.len() > SUSPICIOUS_VOTE_PATTERN_THRESHOLD {
            let mut finding = Finding::new(
                "Suspicious Transaction Pattern".to_string(),
                format!("Account {} shows high frequency transaction pattern", account),
                FindingSeverity::High,
                FindingCategory::SecurityVulnerability,
                *program_id,
                None,
            );
            finding.add_affected_account(account);
            finding.add_metadata("transaction_count".to_string(), patterns.len().to_string());
            finding.with_remediation("Implement rate limiting for transactions per account".to_string());
            findings.push(finding);
        }
    }

    // Check for stake concentration
    if let Ok(stake_accounts) = get_stake_accounts(&rpc_client, program_id) {
        let total_stake: u64 = stake_accounts.iter()
            .map(|s| s.amount)
            .sum();
        
        for stake_account in stake_accounts {
            let stake_percentage = (stake_account.amount as f64 / total_stake as f64) * 100.0;
            if stake_percentage > STAKE_CONCENTRATION_THRESHOLD {
                let mut finding = Finding::new(
                    "High Stake Concentration".to_string(),
                    format!("Account holds {:.2}% of total stake", stake_percentage),
                    FindingSeverity::High,
                    FindingCategory::SecurityVulnerability,
                    *program_id,
                    None,
                );
                finding.add_affected_account(stake_account.owner);
                finding.with_remediation("Consider implementing stake concentration limits".to_string());
                findings.push(finding);
            }
        }
    }

    Ok(())
}

pub async fn monitor_state_consistency(
    program_id: &Pubkey,
    findings: &mut Vec<Finding>
) -> Result<()> {
    // Check proposal state consistency
    let proposals = get_proposals(program_id)?;
    for proposal in proposals {
        // Check for stale proposals
        if proposal.state == ProposalState::Active {
            let current_time = Clock::get()?.unix_timestamp;
            if current_time > proposal.end_time {
                let mut finding = Finding::new(
                    "Stale Proposal State".to_string(),
                    format!("Proposal {} remains active after end time", proposal.title),
                    FindingSeverity::Medium,
                    FindingCategory::DataInconsistency,
                    *program_id,
                    None,
                );
                finding.add_metadata("proposal_id".to_string(), proposal.proposal_id.to_string());
                finding.add_metadata("end_time".to_string(), proposal.end_time.to_string());
                findings.push(finding);
            }
        }

        // Check vote counts
        let total_votes = proposal.yes_votes.checked_add(proposal.no_votes)
            .ok_or_else(|| ProgramError::from(ErrorCode::ArithmeticOverflow))?;
        
        if total_votes > proposal.total_stake_snapshot {
            let mut finding = Finding::new(
                "Invalid Vote Count".to_string(),
                format!("Total votes exceed snapshot of total stake for proposal {}", proposal.title),
                FindingSeverity::Critical,
                FindingCategory::DataInconsistency,
                *program_id,
                None,
            );
            finding.add_metadata("total_votes".to_string(), total_votes.to_string());
            finding.add_metadata("total_stake".to_string(), proposal.total_stake_snapshot.to_string());
            finding.with_remediation("Implement strict vote counting validation".to_string());
            findings.push(finding);
        }
    }

    Ok(())
}

pub async fn monitor_manipulation_attempts(
    program_id: &Pubkey,
    findings: &mut Vec<Finding>
) -> Result<()> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    // Monitor rapid stake changes
    let recent_txs = rpc_client.get_signatures_for_address(program_id)?;
    let mut stake_changes = std::collections::HashMap::new();

    for sig_info in recent_txs {
        if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, None) {
            for account_key in tx.transaction.message.account_keys {
                if let Ok(stake_account) = get_stake_account(&account_key) {
                    let entry = stake_changes.entry(account_key)
                        .or_insert_with(Vec::new);
                    entry.push((stake_account.amount, sig_info.block_time.unwrap_or(0)));
                }
            }
        }
    }

    // Analyze stake change patterns
    for (account, changes) in stake_changes {
        if changes.len() > SUSPICIOUS_VOTE_PATTERN_THRESHOLD {
            findings.push(Finding::new(
                "Suspicious Stake Activity".to_string(),
                format!("Account {} made {} stake changes in a short period", account, changes.len()),
                FindingSeverity::High,
                *program_id,
                None,
            ));
        }
    }

    Ok(())
}

fn get_stake_accounts(program_id: &Pubkey) -> Result<Vec<StakeAccount>> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    let config = RpcProgramAccountsConfig {
        filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, StakeAccount::DISCRIMINATOR.to_vec()))]),
        account_config: RpcAccountInfoConfig {
            encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..RpcAccountInfoConfig::default()
        },
        ..RpcProgramAccountsConfig::default()
    };

    let accounts = rpc_client.get_program_accounts_with_config(program_id, config)?;
    Ok(accounts.into_iter()
        .filter_map(|(_, account)| StakeAccount::try_deserialize(&mut &account.data[..]).ok())
        .collect::<Vec<_>>())
}

fn get_stake_account(account_key: &Pubkey) -> Result<StakeAccount> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    let account = rpc_client.get_account(account_key)?;
    Ok(StakeAccount::try_deserialize(&mut &account.data[..])?)
}

fn get_proposals(program_id: &Pubkey) -> Result<Vec<Proposal>> {
    let rpc_client = RpcClient::new_with_commitment(
        std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()),
        CommitmentConfig::confirmed(),
    );

    let config = RpcProgramAccountsConfig {
        filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, vec![2]))]),
        account_config: RpcAccountInfoConfig {
            encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
            commitment: Some(CommitmentConfig::confirmed()),
            ..RpcAccountInfoConfig::default()
        },
        ..RpcProgramAccountsConfig::default()
    };

    let accounts = rpc_client.get_program_accounts_with_config(program_id, config)?;
    
    accounts.into_iter()
        .filter_map(|(_, account)| Proposal::try_deserialize(&mut &account.data[..]).ok())
        .collect::<Vec<_>>()
}

pub struct ChaosMonitor {
    pub program_id: Pubkey,
    pub findings: Vec<Finding>,
}

impl ChaosMonitor {
    pub fn new(program_id: Pubkey) -> Self {
        Self {
            program_id,
            findings: Vec::new(),
        }
    }

    pub async fn check_execution_anomalies(&mut self) -> Result<()> {
        if let Some(finding) = check_account_permissions(&[])? {
            self.findings.push(finding);
        }

        if let Some(finding) = check_state_consistency(&self.program_id)? {
            self.findings.push(finding);
        }

        Ok(())
    }
}

pub async fn check_state_consistency(program_id: &Pubkey) -> Result<Option<Finding>> {
    let accounts = get_program_accounts(program_id)?;
    let mut total_stake: u64 = 0;

    for (pubkey, account) in accounts {
        if let Ok(stake) = Vote::try_deserialize(&mut &account.data[..]) {
            total_stake = total_stake.checked_add(stake.amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
    }

    // Check for state inconsistencies
    if let Some(inconsistency) = check_data_consistency(program_id)? {
        return Ok(Some(Finding::new(
            FindingCategory::DataInconsistency,
            FindingSeverity::High,
            *program_id,
            format!("State inconsistency detected: {}", inconsistency),
            None,
        )));
    }

    Ok(None)
}

pub async fn check_account_consistency(program_id: &Pubkey) -> Result<Option<Finding>> {
    let proposal_filter = Memcmp {
        offset: 0,
        bytes: MemcmpEncodedBytes::Base58(proposal_discriminator().to_vec()),
        encoding: None,
    };
    
    let accounts = get_program_accounts(program_id, &[proposal_filter])?;
    
    for (proposal_pda, account) in accounts {
        if let Ok(proposal) = Proposal::try_deserialize(&mut &account.data[..]) {
            // Consistency checks...
            if proposal.state != ProposalState::Active && proposal.votes.len() > 0 {
                return Ok(Some(Finding::new(
                    FindingCategory::DataInconsistency,
                    FindingSeverity::High,
                    *program_id,
                    format!("Inconsistent proposal state detected for {}", proposal_pda),
                    None,
                )));
            }
        }
    }
    
    Ok(None)
}

fn verify_proposal_state(proposal: &Proposal) -> bool {
    match proposal.state {
        ProposalState::Active => {
            // Active proposals should have valid voting period
            let current_time = Clock::get().unwrap().unix_timestamp;
            current_time >= proposal.voting_starts_at 
                && current_time <= proposal.voting_ends_at
                && proposal.votes.len() <= MAX_VOTES_PER_PROPOSAL
        }
        ProposalState::Succeeded => {
            // Succeeded proposals should have met quorum and approval threshold
            proposal.votes.len() >= MIN_VOTES_FOR_QUORUM
                && calculate_approval_percentage(proposal) >= APPROVAL_THRESHOLD_PERCENTAGE
        }
        ProposalState::Executed => {
            // Executed proposals must have been succeeded first
            proposal.executed_at.is_some() 
                && proposal.votes.len() >= MIN_VOTES_FOR_QUORUM
                && calculate_approval_percentage(proposal) >= APPROVAL_THRESHOLD_PERCENTAGE
        }
        _ => true, // Other states don't have specific consistency requirements
    }
}

fn calculate_approval_percentage(proposal: &Proposal) -> u8 {
    if proposal.votes.is_empty() {
        return 0;
    }
    
    let total_votes = proposal.votes.len() as u64;
    let approval_votes = proposal.votes
        .iter()
        .filter(|vote| vote.approved)
        .count() as u64;
    
    ((approval_votes * 100) / total_votes) as u8
}

fn verify_vote_data(vote: &Vote) -> bool {
    // Add your vote data verification logic here
    true
}

fn get_all_proposals(program_id: &Pubkey) -> Result<Vec<(Pubkey, Vec<u8>)>> {
    // Implement getting all proposal accounts
    Ok(vec![])
}

fn get_all_votes(program_id: &Pubkey) -> Result<Vec<(Pubkey, Vec<u8>)>> {
    // Implement getting all vote accounts
    Ok(vec![])
}

fn calculate_total_stake(stakes: &[StakeAccount]) -> Result<u64> {
    let mut calculated_total: u64 = 0;
    for stake in stakes {
        calculated_total = calculated_total
            .checked_add(stake.amount)
            .ok_or(ProgramError::from(ErrorCode::ArithmeticOverflow))?;
    }
    Ok(calculated_total)
}

fn verify_stake_consistency(program_id: &Pubkey) -> Result<bool> {
    let stake_filter = Memcmp {
        offset: 0,
        bytes: MemcmpEncodedBytes::Base58(StakeAccount::discriminator().to_vec()),
        encoding: None,
    };
    
    let accounts = get_program_accounts(program_id, &[RpcFilterType::Memcmp(stake_filter)])?;
    let mut total_stake = 0u64;
    
    for (_, account) in accounts {
        if let Ok(stake) = StakeAccount::try_deserialize(&mut &account.data.borrow()[..]) {
            total_stake = total_stake
                .checked_add(stake.amount)
                .ok_or(ProgramError::from(ErrorCode::ArithmeticOverflow))?;
        }
    }
    
    Ok(total_stake > 0)
}

fn verify_proposal_state(proposal: &Proposal) -> bool {
    match proposal.state {
        ProposalState::Active => {
            // Active proposals should have valid voting period
            let current_time = Clock::get().unwrap().unix_timestamp;
            current_time >= proposal.voting_starts_at 
                && current_time <= proposal.voting_ends_at
                && proposal.votes.len() <= MAX_VOTES_PER_PROPOSAL
        }
        ProposalState::Succeeded => {
            // Succeeded proposals should have met quorum and approval threshold
            proposal.votes.len() >= MIN_VOTES_FOR_QUORUM
                && calculate_approval_percentage(proposal) >= APPROVAL_THRESHOLD_PERCENTAGE
        }
        ProposalState::Executed => {
            // Executed proposals must have been succeeded first
            proposal.executed_at.is_some() 
                && proposal.votes.len() >= MIN_VOTES_FOR_QUORUM
                && calculate_approval_percentage(proposal) >= APPROVAL_THRESHOLD_PERCENTAGE
        }
        _ => true, // Other states don't have specific consistency requirements
    }
}

fn calculate_approval_percentage(proposal: &Proposal) -> u8 {
    if proposal.votes.is_empty() {
        return 0;
    }
    
    let total_votes = proposal.votes.len() as u64;
    let approval_votes = proposal.votes
        .iter()
        .filter(|vote| vote.approved)
        .count() as u64;
    
    ((approval_votes * 100) / total_votes) as u8
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FindingSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FindingCategory {
    SecurityVulnerability,
    PerformanceIssue,
    DataInconsistency,
    ConcurrencyIssue,
    LogicError,
    ResourceExhaustion,
    UnauthorizedAccess,
    StateManipulation,
}

#[derive(Debug)]
pub struct Finding {
    pub title: String,
    pub description: String,
    pub severity: FindingSeverity,
    pub category: FindingCategory,
    pub program_id: Pubkey,
    pub transaction_signature: Option<String>,
    pub timestamp: i64,
    pub affected_accounts: Vec<Pubkey>,
    pub metadata: HashMap<String, String>,
    pub remediation: Option<String>,
}

impl Finding {
    pub fn new(
        title: String,
        description: String,
        severity: FindingSeverity,
        category: FindingCategory,
        program_id: Pubkey,
        transaction_signature: Option<String>,
    ) -> Self {
        Self {
            title,
            description,
            severity,
            category,
            program_id,
            transaction_signature,
            timestamp: Clock::get().unwrap_or_default().unix_timestamp,
            affected_accounts: Vec::new(),
            metadata: HashMap::new(),
            remediation: None,
        }
    }

    pub fn with_remediation(mut self, remediation: String) -> Self {
        self.remediation = Some(remediation);
        self
    }

    pub fn add_affected_account(&mut self, account: Pubkey) {
        if !self.affected_accounts.contains(&account) {
            self.affected_accounts.push(account);
        }
    }

    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    pub fn is_critical(&self) -> bool {
        self.severity == FindingSeverity::Critical
    }

    pub fn requires_immediate_action(&self) -> bool {
        matches!(self.severity, FindingSeverity::Critical | FindingSeverity::High)
    }
}

#[error_code]
pub enum MonitoringError {
    #[msg("Arithmetic overflow occurred during calculation")]
    ArithmeticOverflow,
    
    #[msg("Invalid stake amount detected")]
    InvalidStakeAmount,
    
    #[msg("Invalid vote count detected")]
    InvalidVoteCount,
    
    #[msg("State inconsistency detected")]
    StateInconsistency,
    
    #[msg("Unauthorized modification detected")]
    UnauthorizedModification,
    
    #[msg("Resource exhaustion detected")]
    ResourceExhaustion,
    
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    
    #[msg("Invalid lock state")]
    InvalidLockState,
    
    #[msg("High stake concentration detected")]
    HighStakeConcentration,
}

impl From<MonitoringError> for ProgramError {
    fn from(e: MonitoringError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

pub struct SecurityMetrics {
    pub total_transactions: u64,
    pub high_cost_transactions: u64,
    pub failed_transactions: u64,
    pub unique_users: std::collections::HashSet<Pubkey>,
    pub transaction_costs: Vec<u64>,
    pub stake_distribution: HashMap<Pubkey, u64>,
    pub last_update: i64,
    pub anomaly_count: u64,
    pub exploit_attempts: HashMap<String, u64>,
    pub unique_attackers: HashSet<Pubkey>,
    pub active_proposals: u64,
    pub vote_manipulation_attempts: u64,
    pub execution_manipulation_attempts: u64,
    pub state_manipulation_attempts: u64,
    pub redis_used_memory: u64,
    pub redis_metrics: HashMap<String, String>,
}

pub fn parse_redis_info(info: &str) -> HashMap<String, String> {
    let mut metrics = HashMap::new();
    let mut current_section = String::new();
    
    for line in info.trim().lines() {
        if line.starts_with('#') {
            current_section = line.replace('#', "").trim().to_string();
        } else if let Some((k, v)) = line.split_once(':') {
            let key = format!("{}.{}", current_section, k.trim());
            metrics.insert(key, v.trim().to_string());
        }
    }
    
    metrics
}

impl SecurityMetrics {
    pub fn new() -> Self {
        Self {
            total_transactions: 0,
            high_cost_transactions: 0,
            failed_transactions: 0,
            unique_users: HashSet::new(),
            transaction_costs: Vec::new(),
            stake_distribution: HashMap::new(),
            last_update: Clock::get().unwrap_or_default().unix_timestamp,
            anomaly_count: 0,
            exploit_attempts: HashMap::new(),
            unique_attackers: HashSet::new(),
            active_proposals: 0,
            vote_manipulation_attempts: 0,
            execution_manipulation_attempts: 0,
            state_manipulation_attempts: 0,
            redis_used_memory: 0,
            redis_metrics: HashMap::new(),
        }
    }

    pub fn record_transaction(&mut self, cost: u64, user: Pubkey, success: bool) -> Result<()> {
        self.total_transactions = self.total_transactions
            .checked_add(1)
            .with_error_details(|| create_error_context("Transaction Recording", "Failed to increment total transactions"))?;
            
        if cost > HIGH_COST_THRESHOLD {
            self.high_cost_transactions = self.high_cost_transactions
                .checked_add(1)
                .with_error_details(|| create_error_context("Transaction Recording", "Failed to increment high cost transactions"))?;
        }
        
        if !success {
            self.failed_transactions = self.failed_transactions
                .checked_add(1)
                .with_error_details(|| create_error_context("Transaction Recording", "Failed to increment failed transactions"))?;
        }
        
        self.unique_users.insert(user);
        self.transaction_costs.push(cost);
        self.last_update = Clock::get()
            .map(|clock| clock.unix_timestamp)
            .with_error_details(|| create_error_context("Transaction Recording", "Failed to get current timestamp"))?;
        
        Ok(())
    }

    pub fn record_exploit_attempt(&mut self, attack_type: &str, attacker: Pubkey) -> Result<()> {
        let count = self.exploit_attempts.entry(attack_type.to_string()).or_insert(0);
        *count = count
            .checked_add(1)
            .with_error_details(|| create_error_context("Exploit Recording", "Failed to increment exploit attempts"))?;
            
        self.unique_attackers.insert(attacker);
        self.anomaly_count = self.anomaly_count
            .checked_add(1)
            .with_error_details(|| create_error_context("Exploit Recording", "Failed to increment anomaly count"))?;
            
        Ok(())
    }

    pub fn record_manipulation_attempt(&mut self, manipulation_type: ManipulationType) -> Result<()> {
        match manipulation_type {
            ManipulationType::Vote => {
                self.vote_manipulation_attempts = self.vote_manipulation_attempts
                    .checked_add(1)
                    .with_error_details(|| create_error_context("Manipulation Recording", "Failed to increment vote manipulation attempts"))?;
            }
            ManipulationType::Execution => {
                self.execution_manipulation_attempts = self.execution_manipulation_attempts
                    .checked_add(1)
                    .with_error_details(|| create_error_context("Manipulation Recording", "Failed to increment execution manipulation attempts"))?;
            }
            ManipulationType::State => {
                self.state_manipulation_attempts = self.state_manipulation_attempts
                    .checked_add(1)
                    .with_error_details(|| create_error_context("Manipulation Recording", "Failed to increment state manipulation attempts"))?;
            }
        }
        Ok(())
    }

    pub fn calculate_risk_score(&self) -> Result<u64> {
        let base_score = self.anomaly_count
            .checked_mul(10)
            .with_error_details(|| create_error_context("Risk Calculation", "Failed to calculate base risk score"))?;

        let manipulation_score = self.vote_manipulation_attempts
            .checked_add(self.execution_manipulation_attempts)
            .and_then(|sum| sum.checked_add(self.state_manipulation_attempts))
            .with_error_details(|| create_error_context("Risk Calculation", "Failed to calculate manipulation score"))?;

        let weighted_manipulation_score = manipulation_score
            .checked_mul(20)
            .with_error_details(|| create_error_context("Risk Calculation", "Failed to calculate weighted manipulation score"))?;

        base_score
            .checked_add(weighted_manipulation_score)
            .with_error_details(|| create_error_context("Risk Calculation", "Failed to calculate final risk score"))
    }

    pub fn should_trigger_circuit_breaker(&self) -> Result<bool> {
        let risk_score = self.calculate_risk_score()?;
        let failure_rate = if self.total_transactions > 0 {
            (self.failed_transactions as f64 / self.total_transactions as f64) * 100.0
        } else {
            0.0
        };

        // Enhanced circuit breaker logic with multiple conditions
        Ok(
            risk_score > 100 || 
            failure_rate > 20.0 ||
            self.high_cost_transactions > self.total_transactions / 2 ||
            self.unique_attackers.len() > 5
        )
    }

    pub fn get_security_stats(&self) -> SecurityStats {
        SecurityStats {
            total_transactions: self.total_transactions,
            failed_transactions: self.failed_transactions,
            high_cost_transactions: self.high_cost_transactions,
            unique_users: self.unique_users.len() as u64,
            unique_attackers: self.unique_attackers.len() as u64,
            total_manipulation_attempts: self.vote_manipulation_attempts
                .saturating_add(self.execution_manipulation_attempts)
                .saturating_add(self.state_manipulation_attempts),
            last_update: self.last_update,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SecurityStats {
    pub total_transactions: u64,
    pub failed_transactions: u64,
    pub high_cost_transactions: u64,
    pub unique_users: u64,
    pub unique_attackers: u64,
    pub total_manipulation_attempts: u64,
    pub last_update: i64,
}

#[derive(Debug, Clone, Copy)]
pub enum ManipulationType {
    Vote,
    Execution,
    State,
} 



