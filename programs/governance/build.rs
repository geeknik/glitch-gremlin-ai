fn main() {
    println!("cargo:rustc-check-cfg=cfg(target_os, values(\"solana\"))");
    println!("cargo:rustc-cfg=target_arch=\"solana\"");
    println!("cargo:rustc-cfg=target_os=\"solana\"");
}
