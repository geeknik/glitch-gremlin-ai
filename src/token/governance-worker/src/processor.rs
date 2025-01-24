use solana_client::rpc_client::RpcClient;
use borsh::BorshDeserialize;
use solana_program::pubkey::Pubkey;
use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::state::{GovernanceProposal, ProposalStatus};
use crate::error::GovernanceError;

const EXECUTION_DELAY: i64 = 24 * 60 * 60; // 24 hours in seconds
const MIN_VOTE_THRESHOLD: u64 = 100_000; // Minimum votes required

pub async fn process_governance_queue(
    client: &RpcClient,
    program_id: &Pubkey,
) -> Result<(), Box<dyn Error>> {
    let proposals = get_active_proposals(client, program_id)?;

    for proposal in proposals {
        process_proposal(client, program_id, &proposal).await?;
    }

    Ok(())
}

fn get_active_proposals(
    client: &RpcClient,
    program_id: &Pubkey,
) -> Result<Vec<GovernanceProposal>, Box<dyn Error>> {
    let accounts = client.get_program_accounts(program_id)
        .map_err(|e| GovernanceError::ClientError(e.to_string()))?;
    
    let mut proposals = Vec::new();
    
    for (_, account) in accounts {
        if let Ok(proposal) = GovernanceProposal::try_from_slice(&account.data) {
            if proposal.status == ProposalStatus::Active {
                proposals.push(proposal);
            }
        }
    }

    Ok(proposals)
}

async fn process_proposal(
    client: &RpcClient,
    program_id: &Pubkey,
    proposal: &GovernanceProposal,
) -> Result<(), Box<dyn Error>> {
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Check if voting period has ended
    if current_time < proposal.end_time {
        return Ok(());
    }

    // Tally votes
    let total_votes = proposal.yes_votes + proposal.no_votes;
    
    if total_votes < MIN_VOTE_THRESHOLD {
        update_proposal_status(client, program_id, proposal, ProposalStatus::Failed)?;
        return Ok(());
    }

    let vote_threshold = total_votes * 2 / 3; // 66.67% threshold
    
    if proposal.yes_votes >= vote_threshold {
        // Proposal passed, check execution delay
        if current_time >= proposal.end_time + EXECUTION_DELAY {
            execute_proposal(client, program_id, proposal).await?;
            update_proposal_status(client, program_id, proposal, ProposalStatus::Executed)?;
        }
    } else {
        update_proposal_status(client, program_id, proposal, ProposalStatus::Failed)?;
    }

    Ok(())
}

async fn execute_proposal(
    _client: &RpcClient,
    _program_id: &Pubkey,
    proposal: &GovernanceProposal,
) -> Result<(), Box<dyn Error>> {
    // Create and send transaction to execute the proposal
    // This will trigger the chaos test with the parameters specified in the proposal
    
    // TODO: Implement actual transaction creation and sending
    // For now just log
    println!("Executing proposal {}: Testing program {}", 
             proposal.id, proposal.target_program);

    Ok(())
}

fn update_proposal_status(
    _client: &RpcClient,
    _program_id: &Pubkey,
    proposal: &GovernanceProposal,
    new_status: ProposalStatus,
) -> Result<(), Box<dyn Error>> {
    // Create and send transaction to update proposal status
    // TODO: Implement actual transaction creation and sending
    println!("Updating proposal {} status to {:?}", proposal.id, new_status);
    
    Ok(())
}
