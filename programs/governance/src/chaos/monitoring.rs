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
use solana_program::commitment_config::CommitmentConfig;
use solana_client::{
    rpc_client::RpcClient,
    rpc_config::{RpcProgramAccountsConfig, RpcAccountInfoConfig},
    rpc_filter::{RpcFilterType, Memcmp, MemcmpEncodedBytes},
};

const ANOMALY_THRESHOLD_LAMPORTS: u64 = 1_000_000; // 0.001 SOL
const HIGH_COST_THRESHOLD: u64 = 10_000_000; // 0.01 SOL
const CRITICAL_COST_THRESHOLD: u64 = 100_000_000; // 0.1 SOL
const MAX_CONCURRENT_TXS: u64 = 5;
const CONCURRENT_TX_WINDOW_SECS: i64 = 2;

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
    let mut proposals = Vec::new();
    
    // Get program accounts filtered for Proposal type
    let accounts = solana_program::program_pack::Pack::unpack_unchecked(
        &program_id.to_bytes(),
        &[0; 32], // Filter for Proposal discriminator
    )?;
    
    for (_, account) in accounts {
        if let Ok(proposal) = Proposal::try_from_slice(&account.data) {
            proposals.push(proposal);
        }
    }
    
    Ok(proposals)
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

pub fn get_program_accounts(
    program_id: &Pubkey,
    filters: &[RpcFilterType],
) -> Result<Vec<(Pubkey, AccountInfo)>> {
    let rpc_client = RpcClient::new(RPC_URL.to_string());
    let config = RpcProgramAccountsConfig {
        filters: Some(filters.to_vec()),
        account_config: RpcAccountInfoConfig {
            encoding: Some(UiAccountEncoding::Base64),
            data_slice: None,
            commitment: Some(CommitmentConfig::confirmed()),
        },
        with_context: Some(true),
    };

    let accounts = rpc_client
        .get_program_accounts_with_config(program_id, config)?
        .into_iter()
        .map(|(pubkey, account)| {
            let account_info = AccountInfo::new(
                &pubkey,
                false,
                false,
                &mut account.lamports,
                &mut account.data,
                &program_id,
                account.executable,
                account.rent_epoch,
            );
            Ok((pubkey, account_info))
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(accounts)
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
    
    // Get total staked amount from stake pool
    let total_staked = get_total_staked_tokens(program_id)?;
    
    // Get all individual stake accounts
    let stake_accounts = get_all_stake_accounts(program_id)?;
    let mut calculated_total = 0;
    
    // Calculate total from individual stakes
    for stake in stake_accounts {
        calculated_total = calculated_total.checked_add(stake.amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Check stake account constraints
        if stake.amount == 0 {
            inconsistencies.push(format!(
                "Empty stake account found for staker {}",
                stake.staker
            ));
        }
        
        // Check lockup period
        let clock = Clock::get()?;
        if stake.locked_until > clock.unix_timestamp {
            // Verify stake is actually locked
            if !stake.is_locked {
                inconsistencies.push(format!(
                    "Stake for {} should be locked until {} but is not marked as locked",
                    stake.staker, stake.locked_until
                ));
            }
        } else if stake.is_locked {
            inconsistencies.push(format!(
                "Stake for {} is marked as locked but lockup period has expired",
                stake.staker
            ));
        }
    }
    
    // Compare total staked amount
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
    let mut stakes = Vec::new();
    
    // Filter for stake accounts using discriminator
    let accounts = solana_program::program_pack::Pack::unpack_unchecked(
        &program_id.to_bytes(),
        &[2; 32], // Filter for Stake discriminator
    )?;
    
    for (_, account) in accounts {
        if let Ok(stake) = StakeAccount::try_from_slice(&account.data) {
            stakes.push(stake);
        }
    }
    
    Ok(stakes)
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct StakeAccount {
    staker: Pubkey,
    amount: u64,
    locked_until: i64,
    is_locked: bool,
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
    // Check for unauthorized stake changes
    // This is a placeholder for the actual implementation
    Ok(None)
}

pub async fn monitor_proposal_execution(
    program_id: &Pubkey,
    proposal: &Proposal,
    accounts: &[AccountInfo],
) -> Result<()> {
    // Check for potential security issues
    if let Some(finding) = check_execution_anomalies(proposal, accounts).await? {
        msg!("Found potential vulnerability: {:?}", finding);
    }

    Ok(())
}

async fn check_execution_anomalies(
    proposal: &Proposal,
    accounts: &[AccountInfo],
) -> Result<Option<Finding>> {
    // Check for various anomalies
    if let Some(finding) = check_account_permissions(accounts)? {
        return Ok(Some(finding));
    }

    if let Some(finding) = check_state_consistency(proposal.program_id)? {
        return Ok(Some(finding));
    }

    Ok(None)
}

pub fn check_account_permissions(accounts: &[AccountInfo]) -> Result<Option<Finding>> {
    for account in accounts {
        if let Ok(proposal) = Proposal::try_deserialize(&mut &account.data[..]) {
            // Check proposal permissions
            if !verify_proposal_permissions(&proposal) {
                return Ok(Some(Finding::new(
                    FindingCategory::SecurityVulnerability,
                    FindingSeverity::High,
                    *account.key,
                    format!("Suspicious proposal permissions detected for account {}", account.key),
                    None,
                )));
            }
        }
        
        if let Ok(vote) = Vote::try_deserialize(&mut &account.data[..]) {
            // Check vote permissions
            if !verify_vote_permissions(&vote) {
                return Ok(Some(Finding::new(
                    FindingCategory::SecurityVulnerability,
                    FindingSeverity::High,
                    *account.key,
                    format!("Suspicious vote permissions detected for account {}", account.key),
                    None,
                )));
            }
        }
    }
    
    Ok(None)
}

fn verify_proposal_permissions(proposal: &Proposal) -> bool {
    // Add your proposal permission verification logic here
    true
}

fn verify_vote_permissions(vote: &Vote) -> bool {
    // Add your vote permission verification logic here
    true
}

pub fn check_state_consistency(program_id: &Pubkey) -> Result<Option<Finding>> {
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

    // Add your consistency checks here
    Ok(None)
}

pub async fn check_account_consistency(program_id: &Pubkey) -> Result<Option<Finding>> {
    let proposal_filter = MemcmpFilter {
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
