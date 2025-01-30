use syn::{ItemFn, Expr, ExprMethodCall, Block};
use std::collections::{HashMap, HashSet};

/// Types of Solana vulnerabilities to check for
#[derive(Debug, Clone, PartialEq)]
pub enum VulnerabilityType {
    Reentrancy,
    AccountConfusion,
    UnsafeArithmetic,
    MissingOwnerCheck,
    MissingSignerCheck,
    UnsafePdaDerivation,
    UnsafeCrossProgramInvocation,
    RaceCondition,
    UnhandledError,
    StorageExhaustion,
    UnsafeTokenOperation,
    UnsafeProgramUpgrade,
    UnsafeSystemInstruction,
    UnsafeRentHandling,
    UnsafeClockHandling,
    TypeCosplay,
    UnsafePdaValidation,
    UnsafeAccountValidation,
    UnsafeOwnershipModel,
    UnsafeCpiValidation,
    ImproperErrorHandling,
}

/// Represents a detected vulnerability
#[derive(Debug, Clone)]
pub struct Vulnerability {
    pub vuln_type: VulnerabilityType,
    pub severity: String,
    pub description: String,
    pub location: String,
    pub recommendation: String,
}

/// Analyzer for Solana-specific vulnerabilities
pub struct VulnerabilityAnalyzer {
    pub vulnerabilities: Vec<Vulnerability>,
    pub analyzed_functions: HashSet<String>,
    pub cpi_graph: HashMap<String, Vec<String>>,
    pub state_access: HashMap<String, Vec<String>>,
}

impl VulnerabilityAnalyzer {
    pub fn new() -> Self {
        Self {
            vulnerabilities: Vec::new(),
            analyzed_functions: HashSet::new(),
            cpi_graph: HashMap::new(),
            state_access: HashMap::new(),
        }
    }

    /// Analyze a function for potential vulnerabilities
    pub fn analyze_function(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        if self.analyzed_functions.contains(&fn_name) {
            return;
        }

        self.analyzed_functions.insert(fn_name.clone());

        // Check for reentrancy vulnerabilities
        self.check_reentrancy(func);

        // Check for account confusion vulnerabilities
        self.check_account_validation(func);

        // Check for unsafe arithmetic
        self.check_unsafe_arithmetic(func);

        // Check for missing owner checks
        self.check_missing_owner_checks(func);

        // Check for missing signer checks
        self.check_missing_signer_checks(func);

        // Check for unsafe PDA derivation
        self.check_pda_validation(func);

        // Check for unsafe CPIs
        self.check_unsafe_cpi(func);

        // Check for race conditions
        self.check_race_conditions(func);

        // Check for unhandled errors
        self.check_unhandled_errors(func);

        // Check for storage exhaustion
        self.check_storage_exhaustion(func);

        // Check for unsafe token operations
        self.check_token_operations(func);

        // Check for unsafe program upgrade handling
        self.check_program_upgrade(func);

        // Check for unsafe system instruction handling
        self.check_system_instructions(func);

        // Check for unsafe rent handling
        self.check_rent_handling(func);

        // Check for unsafe clock handling
        self.check_clock_handling(func);

        // Check for type cosplay vulnerabilities
        self.check_type_cosplay(func);

        // Replace old CPI and error handling checks with enhanced versions
        self.check_cpi_validation(func);
        self.check_error_handling(func);
    }

    /// Check for reentrancy vulnerabilities
    fn check_reentrancy(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut state_writes = Vec::new();
        let mut cpi_calls = Vec::new();

        visit_block(&func.block, |expr| {
            match expr {
                // Track state mutations
                Expr::AssignOp(_) | Expr::Assign(_) => {
                    state_writes.push(get_location(expr));
                }
                // Track CPI calls
                Expr::Call(call) => {
                    if is_cpi_call(call) {
                        cpi_calls.push(get_location(expr));
                    }
                }
                _ => {}
            }
        });

        // Check for state writes after CPI calls
        if !cpi_calls.is_empty() && !state_writes.is_empty() {
            for cpi_loc in &cpi_calls {
                for write_loc in &state_writes {
                    if write_loc > cpi_loc {
                        self.vulnerabilities.push(Vulnerability {
                            vuln_type: VulnerabilityType::Reentrancy,
                            severity: "Critical".to_string(),
                            description: format!("Potential reentrancy in function {} - state write after CPI", fn_name),
                            location: format!("Function: {}", fn_name),
                            recommendation: "Implement checks-effects-interactions pattern: perform all state changes before external calls".to_string(),
                        });
                        return;
                    }
                }
            }
        }
    }

    /// Enhanced check for account validation
    fn check_account_validation(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut account_accesses = Vec::new();
        let mut account_validations = HashSet::new();
        let mut has_owner_check = false;
        let mut has_size_check = false;
        let mut has_data_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                let method_name = method.method.to_string();
                
                // Track account accesses
                if method_name.contains("data") || 
                   method_name.contains("try_borrow") ||
                   method_name.contains("try_from_slice") {
                    account_accesses.push(get_location(expr));
                }
                
                // Track account validations
                if method_name.contains("verify_account") || 
                   method_name.contains("validate_account") {
                    account_validations.insert(get_location(expr));
                }

                // Check for specific validations
                if method_name.contains("owner") {
                    has_owner_check = true;
                }
                if method_name.contains("size") || method_name.contains("space") {
                    has_size_check = true;
                }
                if method_name.contains("data_is_valid") || method_name.contains("validate_data") {
                    has_data_check = true;
                }
            }
        });

        // Check for unvalidated account accesses
        if !account_accesses.is_empty() {
            for access_loc in &account_accesses {
                if !account_validations.contains(access_loc) {
                    self.vulnerabilities.push(Vulnerability {
                        vuln_type: VulnerabilityType::UnsafeAccountValidation,
                        severity: "Critical".to_string(),
                        description: format!(
                            "Unsafe account access in function {} - account accessed without validation",
                            fn_name
                        ),
                        location: format!("Function: {} at {}", fn_name, access_loc),
                        recommendation: "Always validate accounts before accessing their data".to_string(),
                    });
                }
            }
        }

        // Check for missing validations
        if !account_accesses.is_empty() {
            if !has_owner_check {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeOwnershipModel,
                    severity: "Critical".to_string(),
                    description: format!(
                        "Missing owner check in function {} - account ownership not verified",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Always verify account ownership before accessing account data".to_string(),
                });
            }
            if !has_size_check {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeAccountValidation,
                    severity: "High".to_string(),
                    description: format!(
                        "Missing size check in function {} - account data size not verified",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Verify account data size before accessing account data".to_string(),
                });
            }
            if !has_data_check {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeAccountValidation,
                    severity: "High".to_string(),
                    description: format!(
                        "Missing data validation in function {} - account data not validated",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Implement proper data validation for account contents".to_string(),
                });
            }
        }
    }

    /// Check for unsafe arithmetic operations
    fn check_unsafe_arithmetic(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_unsafe_arithmetic = false;

        visit_block(&func.block, |expr| {
            if let Expr::Binary(binary) = expr {
                if !is_checked_arithmetic(binary) {
                    has_unsafe_arithmetic = true;
                }
            }
        });

        if has_unsafe_arithmetic {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeArithmetic,
                severity: "High".to_string(),
                description: format!("Unchecked arithmetic operations in function {}", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Use checked arithmetic operations (checked_add, checked_sub, etc.)".to_string(),
            });
        }
    }

    /// Check for missing owner checks
    fn check_missing_owner_checks(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_owner_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("owner") {
                    has_owner_check = true;
                }
            }
        });

        if !has_owner_check && needs_owner_check(&fn_name) {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::MissingOwnerCheck,
                severity: "High".to_string(),
                description: format!("Missing owner check in function {}", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Add owner verification for sensitive operations".to_string(),
            });
        }
    }

    /// Check for missing signer checks
    fn check_missing_signer_checks(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_signer_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("is_signer") {
                    has_signer_check = true;
                }
            }
        });

        if !has_signer_check && needs_signer_check(&fn_name) {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::MissingSignerCheck,
                severity: "Critical".to_string(),
                description: format!("Missing signer verification in function {}", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Add explicit signer checks for all privileged operations".to_string(),
            });
        }
    }

    /// Enhanced check for PDA validation
    fn check_pda_validation(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut pda_derivations = Vec::new();
        let mut pda_validations = HashSet::new();
        let mut has_bump_seed = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                let method_name = method.method.to_string();
                
                // Track PDA derivations
                if method_name.contains("find_program_address") || 
                   method_name.contains("create_program_address") {
                    pda_derivations.push(get_location(expr));
                }
                
                // Track PDA validations
                if method_name.contains("verify_pda") || 
                   method_name.contains("check_address") ||
                   method_name.contains("validate_derived") {
                    pda_validations.insert(get_location(expr));
                }

                // Check for bump seed usage
                if method_name.contains("bump") {
                    has_bump_seed = true;
                }
            }
        });

        // Check for unvalidated PDAs
        if !pda_derivations.is_empty() {
            for pda_loc in &pda_derivations {
                if !pda_validations.contains(pda_loc) {
                    self.vulnerabilities.push(Vulnerability {
                        vuln_type: VulnerabilityType::UnsafePdaValidation,
                        severity: "Critical".to_string(),
                        description: format!(
                            "Unsafe PDA validation in function {} - PDA derived but not validated",
                            fn_name
                        ),
                        location: format!("Function: {} at {}", fn_name, pda_loc),
                        recommendation: "Always validate PDAs after derivation using verify_pda or similar functions".to_string(),
                    });
                }
            }
        }

        // Check for missing bump seed
        if !pda_derivations.is_empty() && !has_bump_seed {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafePdaValidation,
                severity: "High".to_string(),
                description: format!(
                    "Missing bump seed usage in function {} - PDAs should use bump seeds for uniqueness",
                    fn_name
                ),
                location: format!("Function: {}", fn_name),
                recommendation: "Use bump seeds when deriving PDAs to ensure uniqueness and prevent address collisions".to_string(),
            });
        }
    }

    /// Check for unsafe cross-program invocations
    fn check_unsafe_cpi(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_cpi = false;
        let mut has_account_validation = false;

        visit_block(&func.block, |expr| {
            if let Expr::Call(call) = expr {
                if is_cpi_call(call) {
                    has_cpi = true;
                }
            }
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("verify_account") {
                    has_account_validation = true;
                }
            }
        });

        if has_cpi && !has_account_validation {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeCrossProgramInvocation,
                severity: "Critical".to_string(),
                description: format!("Unsafe CPI in function {} - missing account validation", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Validate all accounts before performing CPIs".to_string(),
            });
        }
    }

    /// Check for potential race conditions
    fn check_race_conditions(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut state_reads = Vec::new();
        let mut state_writes = Vec::new();

        visit_block(&func.block, |expr| {
            match expr {
                Expr::Field(_) => {
                    state_reads.push(get_location(expr));
                }
                Expr::AssignOp(_) | Expr::Assign(_) => {
                    state_writes.push(get_location(expr));
                }
                _ => {}
            }
        });

        // Check for read-write patterns that might indicate race conditions
        if !state_reads.is_empty() && !state_writes.is_empty() {
            for read_loc in &state_reads {
                for write_loc in &state_writes {
                    if write_loc > read_loc {
                        self.vulnerabilities.push(Vulnerability {
                            vuln_type: VulnerabilityType::RaceCondition,
                            severity: "Medium".to_string(),
                            description: format!("Potential race condition in function {} - state read followed by write", fn_name),
                            location: format!("Function: {}", fn_name),
                            recommendation: "Consider implementing atomic operations or proper synchronization".to_string(),
                        });
                        return;
                    }
                }
            }
        }
    }

    /// Check for unhandled errors
    fn check_unhandled_errors(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_error_handling = false;

        visit_block(&func.block, |expr| {
            match expr {
                Expr::Try(_) | Expr::Match(_) => {
                    has_error_handling = true;
                }
                _ => {}
            }
        });

        if !has_error_handling {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnhandledError,
                severity: "Medium".to_string(),
                description: format!("Potential unhandled errors in function {}", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Implement proper error handling using Result and custom error types".to_string(),
            });
        }
    }

    /// Check for potential storage exhaustion vulnerabilities
    fn check_storage_exhaustion(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_size_check = false;
        let mut creates_storage = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                let method_name = method.method.to_string();
                if method_name.contains("realloc") || method_name.contains("extend") {
                    creates_storage = true;
                }
                if method_name.contains("size_of") || method_name.contains("space") {
                    has_size_check = true;
                }
            }
        });

        if creates_storage && !has_size_check {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::StorageExhaustion,
                severity: "Medium".to_string(),
                description: format!("Potential storage exhaustion in function {}", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Implement proper size checks and limits for storage operations".to_string(),
            });
        }
    }

    /// Check for unsafe token operations
    fn check_token_operations(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_token_operation = false;
        let mut has_token_validation = false;

        visit_block(&func.block, |expr| {
            if let Expr::Call(call) = expr {
                if is_token_operation(call) {
                    has_token_operation = true;
                }
            }
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("verify_token") {
                    has_token_validation = true;
                }
            }
        });

        if has_token_operation && !has_token_validation {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeTokenOperation,
                severity: "Critical".to_string(),
                description: format!("Unsafe token operation in function {} - missing token validation", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Validate token mint, owner, and authority before token operations".to_string(),
            });
        }
    }

    /// Check for unsafe program upgrade handling
    fn check_program_upgrade(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        
        if fn_name.contains("upgrade") {
            let mut has_upgrade_authority = false;
            let mut has_program_data = false;

            visit_block(&func.block, |expr| {
                if let Expr::MethodCall(method) = expr {
                    let method_name = method.method.to_string();
                    if method_name.contains("verify_upgrade_authority") {
                        has_upgrade_authority = true;
                    }
                    if method_name.contains("verify_program_data") {
                        has_program_data = true;
                    }
                }
            });

            if !has_upgrade_authority || !has_program_data {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeProgramUpgrade,
                    severity: "Critical".to_string(),
                    description: format!("Unsafe program upgrade in function {}", fn_name),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Verify upgrade authority and program data account before upgrade".to_string(),
                });
            }
        }
    }

    /// Check for unsafe system instruction handling
    fn check_system_instructions(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_system_instruction = false;
        let mut has_system_program_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::Call(call) = expr {
                if is_system_instruction(call) {
                    has_system_instruction = true;
                }
            }
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("system_program") {
                    has_system_program_check = true;
                }
            }
        });

        if has_system_instruction && !has_system_program_check {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeSystemInstruction,
                severity: "High".to_string(),
                description: format!("Unsafe system instruction in function {} - missing system program check", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Verify system program ID before system instructions".to_string(),
            });
        }
    }

    /// Check for unsafe rent handling
    fn check_rent_handling(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut creates_account = false;
        let mut has_rent_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::Call(call) = expr {
                if is_account_creation(call) {
                    creates_account = true;
                }
            }
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("rent_exempt") {
                    has_rent_check = true;
                }
            }
        });

        if creates_account && !has_rent_check {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeRentHandling,
                severity: "Medium".to_string(),
                description: format!("Unsafe rent handling in function {} - missing rent exempt check", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Ensure accounts are rent exempt when created".to_string(),
            });
        }
    }

    /// Check for unsafe clock handling
    fn check_clock_handling(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut uses_clock = false;
        let mut has_clock_validation = false;

        visit_block(&func.block, |expr| {
            if let Expr::Field(field) = expr {
                if field.member.to_string().contains("clock") {
                    uses_clock = true;
                }
            }
            if let Expr::MethodCall(method) = expr {
                if method.method.to_string().contains("verify_clock") {
                    has_clock_validation = true;
                }
            }
        });

        if uses_clock && !has_clock_validation {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::UnsafeClockHandling,
                severity: "Medium".to_string(),
                description: format!("Unsafe clock handling in function {} - missing clock validation", fn_name),
                location: format!("Function: {}", fn_name),
                recommendation: "Validate clock account before using clock data".to_string(),
            });
        }
    }

    /// Check for type cosplay vulnerabilities
    fn check_type_cosplay(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_deserialization = false;
        let mut has_discriminator_check = false;

        visit_block(&func.block, |expr| {
            if let Expr::MethodCall(method) = expr {
                let method_name = method.method.to_string();
                if method_name.contains("try_from_slice") || 
                   method_name.contains("deserialize") ||
                   method_name.contains("unpack") {
                    has_deserialization = true;
                }
                if method_name.contains("discriminator") || 
                   method_name.contains("account_discriminant") {
                    has_discriminator_check = true;
                }
            }
        });

        if has_deserialization && !has_discriminator_check {
            self.vulnerabilities.push(Vulnerability {
                vuln_type: VulnerabilityType::TypeCosplay,
                severity: "Critical".to_string(),
                description: format!(
                    "Potential type cosplay in function {} - missing discriminator check during deserialization",
                    fn_name
                ),
                location: format!("Function: {}", fn_name),
                recommendation: "Add explicit discriminator checks during account deserialization or use Anchor's Account<T> wrapper".to_string(),
            });
        }
    }

    /// Enhanced check for CPI validation
    fn check_cpi_validation(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut cpi_calls = Vec::new();
        let mut cpi_validations = HashSet::new();
        let mut has_program_check = false;
        let mut has_account_constraints = false;
        let mut has_error_handling = false;

        visit_block(&func.block, |expr| {
            match expr {
                Expr::Call(call) => {
                    if is_cpi_call(call) {
                        cpi_calls.push(get_location(expr));
                    }
                }
                Expr::MethodCall(method) => {
                    let method_name = method.method.to_string();
                    
                    // Track CPI validations
                    if method_name.contains("verify_program_account") || 
                       method_name.contains("check_program_account") {
                        cpi_validations.insert(get_location(expr));
                        has_program_check = true;
                    }
                    if method_name.contains("verify_account_keys") || 
                       method_name.contains("verify_writable") {
                        has_account_constraints = true;
                    }
                }
                Expr::Try(_) | Expr::Match(_) => {
                    has_error_handling = true;
                }
                _ => {}
            }
        });

        // Check for unvalidated CPI calls
        if !cpi_calls.is_empty() {
            for cpi_loc in &cpi_calls {
                if !cpi_validations.contains(cpi_loc) {
                    self.vulnerabilities.push(Vulnerability {
                        vuln_type: VulnerabilityType::UnsafeCpiValidation,
                        severity: "Critical".to_string(),
                        description: format!(
                            "Unsafe CPI in function {} - CPI made without proper validation",
                            fn_name
                        ),
                        location: format!("Function: {} at {}", fn_name, cpi_loc),
                        recommendation: "Always validate program and account constraints before CPI".to_string(),
                    });
                }
            }

            // Check for missing program validation
            if !has_program_check {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeCpiValidation,
                    severity: "Critical".to_string(),
                    description: format!(
                        "Missing program check in function {} - CPI target program not verified",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Always verify the target program ID before making CPIs".to_string(),
                });
            }

            // Check for missing account constraints
            if !has_account_constraints {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::UnsafeCpiValidation,
                    severity: "High".to_string(),
                    description: format!(
                        "Missing account constraints in function {} - CPI account permissions not verified",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Verify account permissions and constraints before CPI".to_string(),
                });
            }

            // Check for missing error handling
            if !has_error_handling {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::ImproperErrorHandling,
                    severity: "High".to_string(),
                    description: format!(
                        "Missing error handling in function {} - CPI errors not properly handled",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Implement proper error handling for CPI calls using Result and custom errors".to_string(),
                });
            }
        }
    }

    /// Enhanced check for error handling
    fn check_error_handling(&mut self, func: &ItemFn) {
        let fn_name = func.sig.ident.to_string();
        let mut has_result_type = false;
        let mut has_custom_errors = false;
        let mut has_error_propagation = false;
        let mut risky_operations = Vec::new();

        // Check return type
        if let syn::ReturnType::Type(_, ty) = &func.sig.output {
            has_result_type = ty.to_token_stream().to_string().contains("Result<");
        }

        visit_block(&func.block, |expr| {
            match expr {
                // Track risky operations that should have error handling
                Expr::Call(call) => {
                    if is_cpi_call(call) || is_token_operation(call) || is_system_instruction(call) {
                        risky_operations.push(get_location(expr));
                    }
                }
                // Check for error handling patterns
                Expr::Try(_) => {
                    has_error_propagation = true;
                }
                Expr::Match(m) => {
                    if m.arms.iter().any(|arm| {
                        arm.pat.to_token_stream().to_string().contains("Err")
                    }) {
                        has_custom_errors = true;
                    }
                }
                _ => {}
            }
        });

        // Check for missing error handling
        if !risky_operations.is_empty() {
            if !has_result_type {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::ImproperErrorHandling,
                    severity: "High".to_string(),
                    description: format!(
                        "Missing Result return type in function {} - errors cannot be properly propagated",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Use Result return type for functions with risky operations".to_string(),
                });
            }

            if !has_custom_errors {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::ImproperErrorHandling,
                    severity: "Medium".to_string(),
                    description: format!(
                        "Missing custom error handling in function {} - errors not properly handled",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Implement custom error types and proper error handling".to_string(),
                });
            }

            if !has_error_propagation {
                self.vulnerabilities.push(Vulnerability {
                    vuln_type: VulnerabilityType::ImproperErrorHandling,
                    severity: "Medium".to_string(),
                    description: format!(
                        "Missing error propagation in function {} - errors not properly propagated",
                        fn_name
                    ),
                    location: format!("Function: {}", fn_name),
                    recommendation: "Use the ? operator to properly propagate errors".to_string(),
                });
            }
        }
    }
}

// Helper functions

fn visit_block<F>(block: &Block, mut visitor: F)
where
    F: FnMut(&Expr),
{
    // Implementation would traverse the block and call visitor for each expression
}

fn is_checked_arithmetic(binary: &syn::ExprBinary) -> bool {
    // Implementation would check if arithmetic operations use checked methods
    false
}

fn is_cpi_call(call: &syn::ExprCall) -> bool {
    // Implementation would check if the call is a CPI
    false
}

fn get_location(expr: &Expr) -> String {
    // Implementation would return a string representation of the expression's location
    String::new()
}

fn needs_owner_check(fn_name: &str) -> bool {
    fn_name.contains("transfer") ||
    fn_name.contains("withdraw") ||
    fn_name.contains("close") ||
    fn_name.contains("update") ||
    fn_name.contains("set")
}

fn needs_signer_check(fn_name: &str) -> bool {
    fn_name.contains("initialize") ||
    fn_name.contains("create") ||
    fn_name.contains("update") ||
    fn_name.contains("transfer") ||
    fn_name.contains("withdraw") ||
    fn_name.contains("close")
}

/// Helper function to check if a call is a token operation
fn is_token_operation(call: &syn::ExprCall) -> bool {
    if let Expr::Path(path) = &*call.func {
        let path_str = path.path.segments.iter()
            .map(|s| s.ident.to_string())
            .collect::<Vec<_>>()
            .join("::");
        
        path_str.contains("mint_to") ||
        path_str.contains("burn") ||
        path_str.contains("transfer") ||
        path_str.contains("approve") ||
        path_str.contains("revoke") ||
        path_str.contains("freeze") ||
        path_str.contains("thaw")
    } else {
        false
    }
}

/// Helper function to check if a call is a system instruction
fn is_system_instruction(call: &syn::ExprCall) -> bool {
    if let Expr::Path(path) = &*call.func {
        let path_str = path.path.segments.iter()
            .map(|s| s.ident.to_string())
            .collect::<Vec<_>>()
            .join("::");
        
        path_str.contains("create_account") ||
        path_str.contains("assign") ||
        path_str.contains("transfer") ||
        path_str.contains("allocate")
    } else {
        false
    }
}

/// Helper function to check if a call creates an account
fn is_account_creation(call: &syn::ExprCall) -> bool {
    if let Expr::Path(path) = &*call.func {
        let path_str = path.path.segments.iter()
            .map(|s| s.ident.to_string())
            .collect::<Vec<_>>()
            .join("::");
        
        path_str.contains("create_account") ||
        path_str.contains("initialize_account") ||
        path_str.contains("create_program_account")
    } else {
        false
    }
} 