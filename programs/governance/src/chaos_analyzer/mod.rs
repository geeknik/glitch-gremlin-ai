mod ast_visitor;
mod solana_patterns;
mod vulnerabilities;

use std::fs;
use std::path::Path;
use syn::parse_file;

use ast_visitor::SolanaAstVisitor;
use solana_patterns::SolanaPatternChecker;
use vulnerabilities::{VulnerabilityAnalyzer, Vulnerability, VulnerabilityType};

/// Main entry point for the Chaos-As-A-Service analyzer
pub struct ChaosAnalyzer {
    ast_visitor: SolanaAstVisitor,
    pattern_checker: SolanaPatternChecker,
    vuln_analyzer: VulnerabilityAnalyzer,
}

impl ChaosAnalyzer {
    pub fn new() -> Self {
        Self {
            ast_visitor: SolanaAstVisitor::new(),
            pattern_checker: SolanaPatternChecker::new(),
            vuln_analyzer: VulnerabilityAnalyzer::new(),
        }
    }

    /// Analyze a Solana program file
    pub fn analyze_file(&mut self, file_path: &Path) -> Result<AnalysisReport, String> {
        let source = fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let syntax = parse_file(&source)
            .map_err(|e| format!("Failed to parse file: {}", e))?;

        // Perform AST analysis
        for item in &syntax.items {
            if let syn::Item::Fn(func) = item {
                self.ast_visitor.visit_item_fn(func);
                self.vuln_analyzer.analyze_function(func);
            }
        }

        // Generate report
        let report = AnalysisReport {
            file_path: file_path.to_string_lossy().to_string(),
            vulnerabilities: self.vuln_analyzer.vulnerabilities.clone(),
            unsafe_patterns: self.collect_unsafe_patterns(),
            recommendations: self.generate_recommendations(),
        };

        Ok(report)
    }

    /// Analyze a directory of Solana programs
    pub fn analyze_directory(&mut self, dir_path: &Path) -> Result<Vec<AnalysisReport>, String> {
        let mut reports = Vec::new();

        if !dir_path.is_dir() {
            return Err("Not a directory".to_string());
        }

        for entry in fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().map_or(false, |ext| ext == "rs") {
                if let Ok(report) = self.analyze_file(&path) {
                    reports.push(report);
                }
            }
        }

        Ok(reports)
    }

    /// Collect unsafe patterns found during analysis
    fn collect_unsafe_patterns(&self) -> Vec<String> {
        let mut patterns = Vec::new();

        // Collect arithmetic patterns
        for func in &self.ast_visitor.unsafe_arithmetic {
            patterns.push(format!("Unsafe arithmetic in function: {}", func));
        }

        // Collect missing authority checks
        for func in &self.ast_visitor.authority_checks {
            patterns.push(format!("Missing authority check in function: {}", func));
        }

        // Collect CPI patterns
        for func in &self.ast_visitor.cpi_calls {
            patterns.push(format!("CPI call in function: {}", func));
        }

        patterns
    }

    /// Generate recommendations based on analysis
    fn generate_recommendations(&self) -> Vec<String> {
        let mut recommendations = Vec::new();

        // Add general recommendations
        recommendations.push("Use checked arithmetic operations for all calculations".to_string());
        recommendations.push("Implement proper error handling for all operations".to_string());
        recommendations.push("Add comprehensive account validation".to_string());
        recommendations.push("Validate all PDAs before use".to_string());
        recommendations.push("Implement proper access control checks".to_string());

        // Add specific recommendations based on findings
        for vuln in &self.vuln_analyzer.vulnerabilities {
            match vuln.vuln_type {
                VulnerabilityType::Reentrancy => {
                    recommendations.push(
                        "Implement checks-effects-interactions pattern for external calls".to_string()
                    );
                }
                VulnerabilityType::AccountConfusion => {
                    recommendations.push(
                        "Add explicit account validation checks for all accounts".to_string()
                    );
                }
                VulnerabilityType::UnsafeArithmetic => {
                    recommendations.push(
                        "Replace unchecked arithmetic with checked operations".to_string()
                    );
                }
                VulnerabilityType::MissingOwnerCheck => {
                    recommendations.push(
                        "Add owner verification for all sensitive operations".to_string()
                    );
                }
                VulnerabilityType::MissingSignerCheck => {
                    recommendations.push(
                        "Add signer verification for all privileged operations".to_string()
                    );
                }
                VulnerabilityType::UnsafePdaDerivation => {
                    recommendations.push(
                        "Validate PDA bump seeds after derivation".to_string()
                    );
                }
                VulnerabilityType::UnsafeCrossProgramInvocation => {
                    recommendations.push(
                        "Add proper account validation before CPI calls".to_string()
                    );
                }
                VulnerabilityType::RaceCondition => {
                    recommendations.push(
                        "Implement atomic operations for state changes".to_string()
                    );
                }
                VulnerabilityType::UnhandledError => {
                    recommendations.push(
                        "Add proper error handling for all operations".to_string()
                    );
                }
                VulnerabilityType::StorageExhaustion => {
                    recommendations.push(
                        "Add size checks and limits for storage operations".to_string()
                    );
                }
            }
        }

        // Deduplicate recommendations
        recommendations.sort();
        recommendations.dedup();
        recommendations
    }
}

/// Represents the analysis report for a Solana program
#[derive(Debug, Clone)]
pub struct AnalysisReport {
    pub file_path: String,
    pub vulnerabilities: Vec<Vulnerability>,
    pub unsafe_patterns: Vec<String>,
    pub recommendations: Vec<String>,
}

impl AnalysisReport {
    /// Generate a markdown report
    pub fn to_markdown(&self) -> String {
        let mut report = String::new();

        report.push_str(&format!("# Security Analysis Report: {}\n\n", self.file_path));

        // Vulnerabilities section
        report.push_str("## Vulnerabilities\n\n");
        if self.vulnerabilities.is_empty() {
            report.push_str("No vulnerabilities found.\n\n");
        } else {
            for vuln in &self.vulnerabilities {
                report.push_str(&format!("### {}\n", vuln.vuln_type.to_string()));
                report.push_str(&format!("- Severity: {}\n", vuln.severity));
                report.push_str(&format!("- Description: {}\n", vuln.description));
                report.push_str(&format!("- Location: {}\n", vuln.location));
                report.push_str(&format!("- Recommendation: {}\n\n", vuln.recommendation));
            }
        }

        // Unsafe patterns section
        report.push_str("## Unsafe Patterns\n\n");
        if self.unsafe_patterns.is_empty() {
            report.push_str("No unsafe patterns found.\n\n");
        } else {
            for pattern in &self.unsafe_patterns {
                report.push_str(&format!("- {}\n", pattern));
            }
            report.push_str("\n");
        }

        // Recommendations section
        report.push_str("## Recommendations\n\n");
        for rec in &self.recommendations {
            report.push_str(&format!("- {}\n", rec));
        }

        report
    }

    /// Generate a JSON report
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|_| "{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_analyze_file() {
        let mut analyzer = ChaosAnalyzer::new();
        let test_file = PathBuf::from("src/lib.rs");
        
        if let Ok(report) = analyzer.analyze_file(&test_file) {
            assert!(!report.recommendations.is_empty());
        }
    }

    #[test]
    fn test_report_generation() {
        let report = AnalysisReport {
            file_path: "test.rs".to_string(),
            vulnerabilities: vec![],
            unsafe_patterns: vec!["Unsafe pattern".to_string()],
            recommendations: vec!["Fix it".to_string()],
        };

        let markdown = report.to_markdown();
        assert!(markdown.contains("# Security Analysis Report"));
        assert!(markdown.contains("Unsafe pattern"));
        assert!(markdown.contains("Fix it"));
    }
} 