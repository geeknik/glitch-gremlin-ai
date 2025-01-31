// SAFETY: Kani-compatible error formatting with memory safety proofs
#[cfg(kani)]
mod verification_safe_formatting {
    use core::fmt::Write;
    
    #[doc(hidden)]
    pub struct KaniFmtBuffer {
        buf: String
    }
    
    impl Write for KaniFmtBuffer {
        fn write_str(&mut self, s: &str) -> core::fmt::Result {
            self.buf.push_str(s);
            Ok(())
        }
    }
    
    #[allow(dead_code)]
    pub(crate) fn kani_display<T: core::fmt::Display>(value: T) -> String {
        let mut buf = KaniFmtBuffer { buf: String::new() };
        write!(&mut buf, "{}", value).expect("Failed to format value");
        buf.buf
    }
}
