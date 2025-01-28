#[cfg(feature = "linux-security")]
use landlock;  // Only included on Linux

#[cfg(not(feature = "linux-security"))]
mod dummy_security {
    // Implement dummy/no-op versions of security functions
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        println!("cargo:rustc-cfg=target_os=\"linux\"");
        println!("cargo:rerun-if-changed=build.rs");
    }

    #[cfg(feature = "linux-security")]
    {
        println!("cargo:rustc-cfg=landlock");
        println!("cargo:rustc-env=LANDLOCK_ENABLED=1");
    }

    #[cfg(not(feature = "linux-security"))]
    {
        println!("cargo:rustc-env=LANDLOCK_ENABLED=0");
    }
} 