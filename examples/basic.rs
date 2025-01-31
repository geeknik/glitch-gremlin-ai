use solana_program::pubkey::Pubkey;
use glitch_gremlin_program::GovernanceState;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Generate a new keypair using solana_program utilities
    let authority = Pubkey::new_unique();
    
    // Create and use governance state
    let state = GovernanceState::new(authority);
    println!("Created new governance state with authority: {}", state.authority);
    
    Ok(())
}
