#[cfg(all(target_os = "linux", feature = "linux-security"))]
pub fn setup_security() -> Result<(), Box<dyn std::error::Error>> {
    // Your landlock security setup code here
    Ok(())
}

#[cfg(not(all(target_os = "linux", feature = "linux-security")))]
pub fn setup_security() -> Result<(), Box<dyn std::error::Error>> {
    // No-op for non-Linux platforms or when security feature is disabled
    Ok(())
} 