#![feature(build_hasher_simple_hash_one)]
#![feature(asm_const)]
#![cfg_attr(target_arch = "bpf", feature(solana_custom_heap))]
//! Glitch Gremlin AI - Command Line Interface
//! 
//! This binary provides the main entrypoint for interacting with the Glitch Gremlin AI system.
//! It handles:
//! - User command parsing
//! - Interaction with the on-chain program
//! - Displaying test results and analytics
//! 
//! # Usage
//! ```sh
//! $ glitch-gremlin-program [COMMAND] [OPTIONS]
//! ```
//! See the documentation for available commands and options.

fn main() {
    println!("Glitch Gremlin AI - Control Interface");
}
