import { 
PublicKey, 
Connection,
AccountInfo,
ParsedAccountData,
Blockhash,
BlockheightBasedTransactionConfirmationStrategy,
FeeCalculator,
Context,
ConfirmedSignatureInfo,
ParsedConfirmedTransaction,
ConfirmedTransactionMeta
} from '@solana/web3.js';

// Security pattern definition
export enum SecurityPattern {
NO_OWNER_CHECKS = 'NO_OWNER_CHECKS',
UNSAFE_CPI = 'UNSAFE_CPI', 
UNVALIDATED_ACCOUNTS = 'UNVALIDATED_ACCOUNTS',
NO_SIGNER_VERIFICATION = 'NO_SIGNER_VERIFICATION',
ARITHMETIC_OVERFLOW = 'ARITHMETIC_OVERFLOW',
REENTRANCY_RISK = 'REENTRANCY_RISK',
UNCHECKED_PDA = 'UNCHECKED_PDA',
DELEGATE_ACCESS = 'DELEGATE_ACCESS'
}

// Analysis result types
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PatternMatch {
pattern: SecurityPattern;
confidence: number;
location?: string;
evidence?: string[];
}

export interface AnalysisResult {
score: number;
riskLevel: RiskLevel;
timestamp: number;
programId: string;
patterns: PatternMatch[];
}

// Solana test mock types
export interface MockAccountInfo {
lamports: number;
owner: PublicKey;
executable: boolean;
rentEpoch: number;
data: Buffer;
}

export interface MockParsedAccountInfo extends MockAccountInfo {
parsed: ParsedAccountData;
}

export interface MockBlockhashResponse {
blockhash: Blockhash;
feeCalculator: FeeCalculator;
}

export interface MockBalanceResponse {
context: Context;
value: number;
}

// Fuzzing types
export interface FuzzingState {
programCounter: number;
coverage: number;
lastCrash: string | null;
mutationHistory: string[];
executionTime: number;
}

export interface FuzzResult {
success: boolean;
coverage: number;
crashes: string[];
testCases: string[];
}

// Test types
export interface AnomalyDetailsItem {
type: string;
score: number;
timestamp: number;
threshold: number;
correlatedPatterns?: SecurityPattern[];
}

export interface AnomalyResult {
isAnomaly: boolean;
confidence: number;
details: AnomalyDetailsItem[];
}

