import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { Governance } from "../target/types/governance";

describe("governance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Governance as Program<Governance>;
  
  const governance = Keypair.generate();
  const proposal = Keypair.generate();
  const voter = Keypair.generate();

  const governanceConfig = {
    minStakeAmount: new anchor.BN(100),
    votingPeriod: new anchor.BN(7 * 24 * 60 * 60), // 1 week
    quorumPercentage: 10,
    executionDelay: new anchor.BN(2 * 24 * 60 * 60), // 2 days
  };

  it("Initializes governance", async () => {
    await program.methods
      .initialize(governanceConfig)
      .accounts({
        governance: governance.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([governance])
      .rpc();

    const state = await program.account.governanceState.fetch(governance.publicKey);
    expect(state.isInitialized).to.be.true;
    expect(state.totalProposals).to.equal(0);
  });

  it("Creates a proposal", async () => {
    await program.methods
      .createProposal(
        "Test Proposal",
        "This is a test proposal",
        new anchor.BN(7 * 24 * 60 * 60)
      )
      .accounts({
        governance: governance.publicKey,
        proposal: proposal.publicKey,
        proposer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([proposal])
      .rpc();

    const proposalState = await program.account.proposal.fetch(proposal.publicKey);
    expect(proposalState.title).to.equal("Test Proposal");
    expect(proposalState.state).to.deep.equal({ active: {} });
  });
});
