impl ModelVoting {
    /// Multi-sig model update proposal
    pub fn propose_model_update(
        &mut self,
        model_hash: [u8; 32],
        activation_slot: u64,
        signatures: &[&[u8; 64]],
    ) -> ProgramResult {
        // 1. Verify quorum of signatures
        let mut valid_sigs = 0;
        for sig in signatures {
            if check_signature(sig, &self.governance_pubkey) {
                valid_sigs += 1;
            }
        }
        
        if valid_sigs < MIN_SIGNATURES {
            return Err(GovernanceError::QuorumNotMet.into());
        }
        
        // 2. Create proposal
        let proposal = ModelProposal {
            model_hash,
            proposed_slot: Clock::get()?.slot,
            activation_slot,
            votes: 0,
            state: ProposalState::Pending,
        };
        
        // 3. Store proposal
        self.pending_proposals.push(proposal);
        
        Ok(())
    }

    /// Commit approved model
    pub fn commit_model(
        &mut self,
        proposal_id: u64,
        model_data: &[u8],
    ) -> ProgramResult {
        let proposal = self.get_proposal(proposal_id)?;
        
        // Verify proposal passed
        if proposal.state != ProposalState::Approved {
            return Err(GovernanceError::ProposalNotApproved.into());
        }
        
        // Forward to model registry
        let model_registry = get_model_registry()?;
        model_registry.update_model(
            proposal.model_hash,
            model_data,
            proposal.activation_slot,
        )
    }
}
