use syn::{
    visit::{self, Visit},
    Expr, ExprBinary, ExprCall, ExprMethodCall, ItemFn, Signature,
    BinOp, Item, ImplItem, Block,
};
use std::collections::HashSet;

/// Visitor for analyzing Solana smart contract AST
pub struct SolanaAstVisitor {
    pub unsafe_arithmetic: HashSet<String>,
    pub authority_checks: HashSet<String>,
    pub cpi_calls: HashSet<String>,
    pub state_mutations: HashSet<String>,
    pub current_function: Option<String>,
}

impl SolanaAstVisitor {
    pub fn new() -> Self {
        Self {
            unsafe_arithmetic: HashSet::new(),
            authority_checks: HashSet::new(),
            cpi_calls: HashSet::new(),
            state_mutations: HashSet::new(),
            current_function: None,
        }
    }

    /// Check if an arithmetic operation is using checked math
    fn is_checked_arithmetic(&self, expr: &ExprMethodCall) -> bool {
        let method_name = expr.method.to_string();
        matches!(
            method_name.as_str(),
            "checked_add" | "checked_sub" | "checked_mul" | "checked_div"
        )
    }

    /// Check if a method call is an authority check
    fn is_authority_check(&self, expr: &ExprMethodCall) -> bool {
        let method_name = expr.method.to_string();
        matches!(
            method_name.as_str(),
            "verify_authority" | "verify_signer" | "verify_program_owner" |
            "verify_token_owner" | "verify_governance" | "verify_not_halted"
        )
    }

    /// Check if a call is a CPI (Cross-Program Invocation)
    fn is_cpi_call(&self, expr: &ExprCall) -> bool {
        // Check if the call is to another program's instruction
        if let Expr::Path(path) = &*expr.func {
            let path_str = path.path.segments.iter()
                .map(|s| s.ident.to_string())
                .collect::<Vec<_>>()
                .join("::");
            
            path_str.contains("instruction") || 
            path_str.contains("cpi") ||
            path_str.contains("invoke") ||
            path_str.contains("transfer")
        } else {
            false
        }
    }

    /// Check if a function needs authority checks based on its signature
    fn needs_authority_check(&self, sig: &Signature) -> bool {
        let fn_name = sig.ident.to_string();
        
        // Functions that typically need authority checks
        fn_name.contains("initialize") ||
        fn_name.contains("update") ||
        fn_name.contains("set") ||
        fn_name.contains("create") ||
        fn_name.contains("delete") ||
        fn_name.contains("withdraw") ||
        fn_name.contains("transfer") ||
        fn_name.contains("mint") ||
        fn_name.contains("burn") ||
        fn_name.contains("execute") ||
        fn_name.contains("admin")
    }
}

impl<'ast> Visit<'ast> for SolanaAstVisitor {
    fn visit_item_fn(&mut self, node: &'ast ItemFn) {
        self.current_function = Some(node.sig.ident.to_string());
        
        // Check if function needs authority checks
        if self.needs_authority_check(&node.sig) {
            self.authority_checks.insert(self.current_function.clone().unwrap());
        }
        
        visit::visit_item_fn(self, node);
        self.current_function = None;
    }

    fn visit_expr_binary(&mut self, node: &'ast ExprBinary) {
        if let Some(fn_name) = &self.current_function {
            // Check for unsafe arithmetic operations
            match node.op {
                BinOp::Add(_) | BinOp::Sub(_) | BinOp::Mul(_) | BinOp::Div(_) => {
                    self.unsafe_arithmetic.insert(fn_name.clone());
                }
                _ => {}
            }
        }
        visit::visit_expr_binary(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast ExprMethodCall) {
        if let Some(fn_name) = &self.current_function {
            // Check for checked arithmetic
            if self.is_checked_arithmetic(node) {
                self.unsafe_arithmetic.remove(fn_name);
            }
            
            // Check for authority checks
            if self.is_authority_check(node) {
                self.authority_checks.remove(fn_name);
            }
        }
        visit::visit_expr_method_call(self, node);
    }

    fn visit_expr_call(&mut self, node: &'ast ExprCall) {
        if let Some(fn_name) = &self.current_function {
            // Track CPI calls
            if self.is_cpi_call(node) {
                self.cpi_calls.insert(fn_name.clone());
            }
        }
        visit::visit_expr_call(self, node);
    }

    fn visit_expr_assign(&mut self, node: &'ast syn::ExprAssign) {
        if let Some(fn_name) = &self.current_function {
            // Track state mutations
            self.state_mutations.insert(fn_name.clone());
        }
        visit::visit_expr_assign(self, node);
    }
}

/// Helper function to analyze a function's AST
pub fn analyze_function(func: &ItemFn) -> SolanaAstVisitor {
    let mut visitor = SolanaAstVisitor::new();
    visitor.visit_item_fn(func);
    visitor
}

/// Helper function to analyze an implementation block
pub fn analyze_impl(impl_block: &syn::ItemImpl) -> SolanaAstVisitor {
    let mut visitor = SolanaAstVisitor::new();
    
    for item in &impl_block.items {
        if let ImplItem::Method(method) = item {
            visitor.visit_item_fn(&method.sig.fn_token.into());
        }
    }
    
    visitor
}

/// Helper function to detect reentrancy vulnerabilities
pub fn check_reentrancy(visitor: &SolanaAstVisitor) -> bool {
    for fn_name in &visitor.state_mutations {
        if visitor.cpi_calls.contains(fn_name) {
            // Function has both state mutations and CPI calls
            // This could indicate a potential reentrancy vulnerability
            return true;
        }
    }
    false
}

/// Helper function to detect missing authority checks
pub fn check_missing_authority(visitor: &SolanaAstVisitor) -> Vec<String> {
    visitor.authority_checks.iter().cloned().collect()
}

/// Helper function to detect unsafe arithmetic
pub fn check_unsafe_arithmetic(visitor: &SolanaAstVisitor) -> Vec<String> {
    visitor.unsafe_arithmetic.iter().cloned().collect()
}

/// Helper function to traverse a block and visit each expression
fn visit_block<F>(block: &Block, mut visitor: F)
where
    F: FnMut(&Expr),
{
    for stmt in &block.stmts {
        match stmt {
            syn::Stmt::Expr(expr) => {
                visitor(expr);
                visit_expr(expr, &mut visitor);
            }
            syn::Stmt::Local(local) => {
                if let Some((_, expr)) = &local.init {
                    visitor(expr);
                    visit_expr(expr, &mut visitor);
                }
            }
            _ => {}
        }
    }
}

/// Helper function to recursively visit expressions
fn visit_expr<F>(expr: &Expr, visitor: &mut F)
where
    F: FnMut(&Expr),
{
    match expr {
        Expr::Array(array) => {
            for elem in &array.elems {
                visitor(elem);
                visit_expr(elem, visitor);
            }
        }
        Expr::Binary(binary) => {
            visitor(&binary.left);
            visit_expr(&binary.left, visitor);
            visitor(&binary.right);
            visit_expr(&binary.right, visitor);
        }
        Expr::Block(block) => {
            visit_block(&block.block, visitor);
        }
        Expr::Call(call) => {
            visitor(&call.func);
            visit_expr(&call.func, visitor);
            for arg in &call.args {
                visitor(arg);
                visit_expr(arg, visitor);
            }
        }
        Expr::MethodCall(method) => {
            visitor(&method.receiver);
            visit_expr(&method.receiver, visitor);
            for arg in &method.args {
                visitor(arg);
                visit_expr(arg, visitor);
            }
        }
        _ => {}
    }
}

/// Helper function to check if arithmetic operations use checked methods
fn is_checked_arithmetic(binary: &syn::ExprBinary) -> bool {
    match binary.op {
        BinOp::Add(_) | BinOp::Sub(_) | BinOp::Mul(_) | BinOp::Div(_) => {
            // Check if the operation is wrapped in a checked_* call
            if let Expr::MethodCall(method) = &*binary.left {
                let method_name = method.method.to_string();
                return method_name.starts_with("checked_");
            }
            false
        }
        _ => true, // Non-arithmetic operations are considered "checked"
    }
}

/// Helper function to check if a call is a CPI
fn is_cpi_call(call: &syn::ExprCall) -> bool {
    if let Expr::Path(path) = &*call.func {
        let path_str = path.path.segments.iter()
            .map(|s| s.ident.to_string())
            .collect::<Vec<_>>()
            .join("::");
        
        // Check for common CPI patterns
        path_str.contains("invoke") ||
        path_str.contains("invoke_signed") ||
        path_str.contains("transfer") ||
        path_str.contains("mint_to") ||
        path_str.contains("burn") ||
        path_str.contains("transfer_checked") ||
        path_str.contains("approve") ||
        path_str.contains("create_account") ||
        path_str.contains("initialize_account")
    } else {
        false
    }
}

/// Helper function to get the location of an expression
fn get_location(expr: &Expr) -> String {
    if let Some(span) = expr.span().start().line.checked_sub(1) {
        format!("Line {}", span)
    } else {
        "Unknown location".to_string()
    }
} 