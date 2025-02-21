use std::{env, path::PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    // Set up build configuration
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");
    println!("cargo:rerun-if-changed=src/");

    // Configure feature flags
    if cfg!(feature = "secure-mode") {
        println!("cargo:rustc-cfg=secure_mode");
    }
    if cfg!(feature = "post-quantum") {
        println!("cargo:rustc-cfg=post_quantum");
    }
    if cfg!(feature = "chaos-engine") {
        println!("cargo:rustc-cfg=chaos_engine");
    }
    if cfg!(feature = "monitoring") {
        println!("cargo:rustc-cfg=monitoring");
    }

    // Set up Solana-specific flags
    println!("cargo:rustc-env=SOLANA_SDK_VERSION=1.17.0");
    println!("cargo:rustc-env=PROGRAM_NAME=glitch_gremlin_governance");
    println!("cargo:rustc-env=PROGRAM_VERSION={}", env::var("CARGO_PKG_VERSION").unwrap());

    // Configure optimization flags for SBF target
    if cfg!(not(debug_assertions)) {
        println!("cargo:rustc-cfg=release");
        println!("cargo:rustc-link-arg=-s"); // Strip symbols in release mode
    }

    // Set up security flags
    println!("cargo:rustc-link-arg=-z");
    println!("cargo:rustc-link-arg=noexecstack");
    println!("cargo:rustc-link-arg=-z");
    println!("cargo:rustc-link-arg=relro");
    println!("cargo:rustc-link-arg=-z");
    println!("cargo:rustc-link-arg=now");

    // Configure test environment
    if cfg!(test) {
        println!("cargo:rustc-cfg=test_build");
        println!("cargo:rustc-env=RUST_BACKTRACE=1");
    }

    // Set up monitoring configuration
    if cfg!(feature = "monitoring") {
        let metrics_config = format!(
            r#"{{
                "program_id": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
                "metrics_port": 9090,
                "log_level": "debug"
            }}"#
        );
        std::fs::write(out_dir.join("metrics_config.json"), metrics_config).unwrap();
    }

    // Generate security policy
    let security_policy = format!(
        r#"# Security Policy for Glitch Gremlin Governance Program
Program ID: GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw
Version: {}
Build Time: {}

## Security Features
- Secure Mode: {}
- Post Quantum: {}
- Chaos Engine: {}
- Monitoring: {}

## Resource Limits
- Compute Units: 1,400,000
- Memory Limit: 256KB
- Stack Size: 128KB

## Contact
For security issues, please contact:
- Email: security@glitchgremlin.ai
- Discord: GlitchGremlin#Security
"#,
        env::var("CARGO_PKG_VERSION").unwrap(),
        chrono::Utc::now(),
        cfg!(feature = "secure-mode"),
        cfg!(feature = "post-quantum"),
        cfg!(feature = "chaos-engine"),
        cfg!(feature = "monitoring"),
    );
    std::fs::write(out_dir.join("SECURITY.md"), security_policy).unwrap();
} 