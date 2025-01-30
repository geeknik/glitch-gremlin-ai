use syn::{ItemFn, Expr, ExprMethodCall};
use std::collections::HashSet;

/// Common Solana security patterns to check for
pub struct SolanaPatternChecker {
    pub pda_checks: HashSet<String>,
    pub account_validation: HashSet<String>,
    pub signer_checks: HashSet<String>,
    pub owner_checks: HashSet<String>,
    pub rent_checks: HashSet<String>,
}

impl SolanaPatternChecker {
    pub fn new() -> Self {
        Self {
            pda_checks: HashSet::new(),
            account_validation: HashSet::new(),
            signer_checks: HashSet::new(),
            owner_checks: HashSet::new(),
            rent_checks: HashSet::new(),
        }
    }

    /// Check for proper PDA derivation and validation
    pub fn check_pda_pattern(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Look for find_program_address calls
        let has_pda_derivation = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("find_program_address")
            } else {
                false
            }
        });

        // Look for PDA validation
        let has_pda_validation = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("verify_pda")
            } else {
                false
            }
        });

        if has_pda_derivation && !has_pda_validation {
            issues.push(format!("Function {} derives PDAs but may not validate them", fn_name));
        }

        issues
    }

    /// Check for proper account validation patterns
    pub fn check_account_validation(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Check for account ownership validation
        let has_owner_check = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("verify_account_owner")
            } else {
                false
            }
        });

        // Check for account data validation
        let has_data_check = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("verify_account_data")
            } else {
                false
            }
        });

        if !has_owner_check {
            issues.push(format!("Function {} may not validate account ownership", fn_name));
        }

        if !has_data_check {
            issues.push(format!("Function {} may not validate account data", fn_name));
        }

        issues
    }

    /// Check for proper signer verification
    pub fn check_signer_verification(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Look for is_signer checks
        let has_signer_check = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("is_signer")
            } else {
                false
            }
        });

        if !has_signer_check && needs_signer_check(&fn_name) {
            issues.push(format!("Function {} may not verify signers", fn_name));
        }

        issues
    }

    /// Check for proper rent exemption handling
    pub fn check_rent_exemption(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Look for rent exemption checks
        let has_rent_check = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
                method.method.to_string().contains("is_rent_exempt")
            } else {
                false
            }
        });

        if !has_rent_check && creates_accounts(&fn_name) {
            issues.push(format!("Function {} may not check for rent exemption", fn_name));
        }

        issues
    }

    /// Check for proper close account handling
    pub fn check_account_closing(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Look for proper account closing pattern
        let has_close_pattern = has_proper_close_pattern(func);

        if !has_close_pattern && needs_close_pattern(&fn_name) {
            issues.push(format!("Function {} may not properly close accounts", fn_name));
        }

        issues
    }

    /// Check for proper initialization patterns
    pub fn check_initialization_pattern(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        if fn_name.contains("init") || fn_name.contains("initialize") {
            // Check for discriminator initialization
            let has_discriminator = has_discriminator_init(func);
            if !has_discriminator {
                issues.push(format!("Function {} may not properly initialize account discriminator", fn_name));
            }

            // Check for proper space allocation
            let has_space_check = has_proper_space_check(func);
            if !has_space_check {
                issues.push(format!("Function {} may not properly check account space", fn_name));
            }
        }

        issues
    }

    /// Check for proper Anchor account validation patterns
    pub fn check_anchor_patterns(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Check for #[account] attribute usage
        let has_account_attr = func.attrs.iter().any(|attr| {
            attr.path().segments.iter().any(|seg| seg.ident == "account")
        });

        // Check for Account type usage
        let has_account_type = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Local(local) = stmt {
                if let Some(ty) = &local.ty {
                    ty.to_token_stream().to_string().contains("Account<")
                } else {
                    false
                }
            } else {
                false
            }
        });

        // Check for proper constraint usage
        let has_constraints = func.attrs.iter().any(|attr| {
            attr.path().segments.iter().any(|seg| 
                seg.ident == "constraint" || 
                seg.ident == "has_one" || 
                seg.ident == "belongs_to"
            )
        });

        if !has_account_attr && has_account_type {
            issues.push(format!(
                "Function {} uses Account type without #[account] attribute",
                fn_name
            ));
        }

        if has_account_type && !has_constraints {
            issues.push(format!(
                "Function {} may be missing account constraints",
                fn_name
            ));
        }

        issues
    }

    /// Check for proper Anchor error handling
    pub fn check_anchor_errors(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Check for Result return type with custom error
        let has_result_type = if let syn::ReturnType::Type(_, ty) = &func.sig.output {
            ty.to_token_stream().to_string().contains("Result<")
        } else {
            false
        };

        // Check for proper error handling
        let has_error_handling = func.block.stmts.iter().any(|stmt| {
            if let syn::Stmt::Expr(expr) = stmt {
                match expr {
                    Expr::Try(_) => true,
                    Expr::Match(m) => m.arms.iter().any(|arm| {
                        arm.pat.to_token_stream().to_string().contains("Err")
                    }),
                    _ => false
                }
            } else {
                false
            }
        });

        if !has_result_type {
            issues.push(format!(
                "Function {} should return Result with custom error type",
                fn_name
            ));
        }

        if !has_error_handling && has_result_type {
            issues.push(format!(
                "Function {} may need explicit error handling",
                fn_name
            ));
        }

        issues
    }

    /// Check for proper Anchor program structure
    pub fn check_anchor_program(&self, func: &ItemFn) -> Vec<String> {
        let mut issues = Vec::new();
        let fn_name = func.sig.ident.to_string();

        // Check for #[program] attribute
        let has_program_attr = func.attrs.iter().any(|attr| {
            attr.path().segments.iter().any(|seg| seg.ident == "program")
        });

        // Check for proper context parameter
        let has_context_param = func.sig.inputs.iter().any(|arg| {
            if let syn::FnArg::Typed(pat_type) = arg {
                pat_type.ty.to_token_stream().to_string().contains("Context<")
            } else {
                false
            }
        });

        if !has_program_attr && needs_program_attr(&fn_name) {
            issues.push(format!(
                "Function {} may need #[program] attribute",
                fn_name
            ));
        }

        if !has_context_param {
            issues.push(format!(
                "Function {} should take Context parameter",
                fn_name
            ));
        }

        issues
    }
}

/// Helper function to determine if a function needs signer verification
fn needs_signer_check(fn_name: &str) -> bool {
    fn_name.contains("init") ||
    fn_name.contains("create") ||
    fn_name.contains("update") ||
    fn_name.contains("delete") ||
    fn_name.contains("transfer") ||
    fn_name.contains("withdraw")
}

/// Helper function to determine if a function creates accounts
fn creates_accounts(fn_name: &str) -> bool {
    fn_name.contains("init") ||
    fn_name.contains("create") ||
    fn_name.contains("new")
}

/// Helper function to determine if a function needs account closing pattern
fn needs_close_pattern(fn_name: &str) -> bool {
    fn_name.contains("close") ||
    fn_name.contains("delete") ||
    fn_name.contains("remove")
}

/// Helper function to check for proper account closing pattern
fn has_proper_close_pattern(func: &ItemFn) -> bool {
    // Look for proper lamports transfer and account data clearing
    let has_lamports_transfer = func.block.stmts.iter().any(|stmt| {
        if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
            method.method.to_string().contains("transfer_lamports")
        } else {
            false
        }
    });

    let has_data_clear = func.block.stmts.iter().any(|stmt| {
        if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
            method.method.to_string().contains("assign") ||
            method.method.to_string().contains("clear")
        } else {
            false
        }
    });

    has_lamports_transfer && has_data_clear
}

/// Helper function to check for discriminator initialization
fn has_discriminator_init(func: &ItemFn) -> bool {
    func.block.stmts.iter().any(|stmt| {
        if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
            method.method.to_string().contains("discriminator") ||
            method.method.to_string().contains("anchor_discriminator")
        } else {
            false
        }
    })
}

/// Helper function to check for proper space allocation
fn has_proper_space_check(func: &ItemFn) -> bool {
    func.block.stmts.iter().any(|stmt| {
        if let syn::Stmt::Expr(Expr::MethodCall(method)) = stmt {
            method.method.to_string().contains("space") ||
            method.method.to_string().contains("size_of")
        } else {
            false
        }
    })
}

/// Helper function to analyze a method call for common Solana patterns
pub fn analyze_method_call(call: &ExprMethodCall) -> Option<String> {
    let method_name = call.method.to_string();
    
    match method_name.as_str() {
        "find_program_address" => Some("PDA Derivation".to_string()),
        "create_program_address" => Some("PDA Creation".to_string()),
        "try_from_slice" => Some("Account Deserialization".to_string()),
        "pack" | "unpack" => Some("Account Serialization".to_string()),
        "transfer" | "transfer_lamports" => Some("Value Transfer".to_string()),
        "invoke" | "invoke_signed" => Some("CPI".to_string()),
        _ => None
    }
}

/// Helper function to determine if a function needs #[program] attribute
fn needs_program_attr(fn_name: &str) -> bool {
    fn_name.contains("initialize") ||
    fn_name.contains("create") ||
    fn_name.contains("process") ||
    fn_name.contains("execute") ||
    fn_name.contains("handle")
} 