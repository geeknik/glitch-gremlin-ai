fn main() {
    // Secure Solana-specific config (Section 9.6 Compliance)
    println!("cargo:rustc-check-cfg=cfg(solana)");
    println!("cargo:rustc-cfg=solana");
}
