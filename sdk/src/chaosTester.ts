import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    Commitment,
    PublicKeyInitData
} from '@solana/web3.js';
import {
    ChaosTesterConfig,
    FuzzingConfig,
    FuzzingMetrics,
    FuzzingMutation,
    FuzzingResult,
    MutationType,
    SecurityLevel,
    VulnerabilityType,
    VulnerabilityInfo,
    SecurityContext,
    ErrorCode,
    ValidationResult,
    ErrorDetails,
    ErrorObject,
    ErrorLike,
    ErrorMetadata
} from './types.js';
import { GlitchError } from './errors.js';
import Redis from 'ioredis';
import { createError } from './errors.js';

interface MutationMetadata {
    instruction?: string;
    expectedValue?: string | number;
    actualValue?: string | number;
    custom?: boolean;
    timestamp?: number;
    computeUnits?: number;
    memoryUsage?: number;
}

export class ChaosTester {
    private connection: Connection;
    private programId: PublicKey;
    private securityLevel: SecurityLevel;
    private redis?: Redis;
    private metrics: FuzzingMetrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalTests: 0,
        executionTime: 0,
        errorRate: 0,
        coverage: 0,
        vulnerabilitiesFound: [],
        securityScore: 100,
        riskLevel: 'low',
        averageExecutionTime: 0,
        peakMemoryUsage: 0,
        cpuUsage: 0,
        networkUsage: 0,
        anomalyScore: 0,
        falsePositiveRate: 0
    };

    constructor(config: ChaosTesterConfig) {
        this.connection = new Connection(
            config.connection.endpoint,
            config.connection.commitment as Commitment | undefined
        );
        this.programId = new PublicKey(config.programId);
        this.securityLevel = config.securityLevel;

        if (config.redis) {
            this.redis = new Redis({
                host: config.redis.host,
                port: config.redis.port,
                password: config.redis.password,
            });
        }
    }

    private initializeMetrics(): FuzzingMetrics {
        return {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalTests: 0,
            executionTime: 0,
            errorRate: 0,
            coverage: 0,
            vulnerabilitiesFound: [],
            securityScore: 0,
            riskLevel: 'LOW',
            averageExecutionTime: 0,
            peakMemoryUsage: 0,
            cpuUtilization: 0,
            uniquePaths: 0,
            edgeCoverage: 0,
            mutationEfficiency: 0
        };
    }

    private async executeTestTransaction(
        instruction: TransactionInstruction,
        payer: Keypair
    ): Promise<boolean> {
        try {
            const transaction = new Transaction().add(instruction);
            await sendAndConfirmTransaction(this.connection, transaction, [payer]);
            return true;
        } catch (error) {
            return false;
        }
    }

    private getErrorMessage(error: unknown): string {
        if (error && typeof error === 'object') {
            if ('message' in error && typeof error.message === 'string') {
                return error.message;
            }
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error occurred during program execution';
    }

    private createErrorDetails(code: ErrorCode, message: string, metadata: ErrorMetadata): ErrorDetails {
        return {
            code,
            message,
            metadata,
            timestamp: Date.now(),
            stackTrace: new Error().stack || '',
            source: {
                file: 'chaosGenerator.ts',
                line: 0,
                function: 'unknown'
            }
        };
    }

    private serializePayload(payload: any): string | number | boolean | null {
        if (payload instanceof Buffer) {
            return payload.toString('hex');
        }
        if (payload instanceof PublicKey) {
            return payload.toBase58();
        }
        if (typeof payload === 'object' && payload !== null) {
            return JSON.stringify(payload);
        }
        return payload;
    }

    private createErrorMetadata(instruction: string, error: string, mutation: FuzzingMutation): ErrorMetadata {
        return {
            programId: this.programId.toString(),
            instruction,
            error,
            accounts: [],
            value: null,
            payload: this.serializePayload(mutation.payload),
            mutation: {
                type: mutation.type,
                target: mutation.target,
                payload: this.serializePayload(mutation.payload)
            },
            securityContext: {
                environment: 'testnet',
                computeUnits: 0,
                memoryUsage: 0,
                upgradeable: false,
                validations: {
                    ownerChecked: false,
                    signerChecked: false,
                    accountDataMatched: false,
                    pdaVerified: false,
                    bumpsMatched: false
                }
            }
        };
    }

    private handleMutationError(mutation: FuzzingMutation, error: Error): never {
        const metadata = this.createErrorMetadata(
            'executeMutation',
            error.message,
            mutation
        );
        const errorDetails = this.createErrorDetails(
            ErrorCode.MUTATION_ERROR,
            'Error executing mutation',
            metadata
        );
        throw new GlitchError('Mutation execution failed', ErrorCode.MUTATION_ERROR, errorDetails);
    }

    private createBasicErrorMetadata(instruction: string, error: string): ErrorMetadata {
        return {
            programId: this.programId.toString(),
            instruction,
            error,
            accounts: [],
            value: null,
            payload: null,
            mutation: {
                type: '',
                target: '',
                payload: null
            },
            securityContext: {
                environment: 'testnet',
                computeUnits: 0,
                memoryUsage: 0,
                upgradeable: false,
                validations: {
                    ownerChecked: false,
                    signerChecked: false,
                    accountDataMatched: false,
                    pdaVerified: false,
                    bumpsMatched: false
                }
            }
        };
    }

    private handleError(error: Error, instruction: string): never {
        const metadata = this.createBasicErrorMetadata(instruction, error.message);
        const errorDetails = this.createErrorDetails(
            ErrorCode.UNKNOWN_ERROR,
            error.message,
            metadata
        );
        throw new GlitchError('Operation failed', ErrorCode.UNKNOWN_ERROR, errorDetails);
    }

    private async executeMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            if (!mutation.target) {
                throw createError(
                    ErrorCode.INVALID_MUTATION_TARGET,
                    'Mutation requires a valid target program address',
                    this.createErrorDetails(
                        ErrorCode.INVALID_MUTATION_TARGET,
                        'Mutation requires a valid target program address',
                        {
                            securityContext: {
                                environment: this.connection.rpcEndpoint.includes('mainnet') ? 'mainnet' : 'testnet'
                            }
                        }
                    )
                );
            }

            // Validate program executable status before mutation
            const programInfo = await this.connection.getAccountInfo(new PublicKey(mutation.target));
            if (!programInfo?.executable) {
                throw createError(
                    ErrorCode.INVALID_PROGRAM_ACCOUNT,
                    'Target account is not an executable program',
                    this.createErrorDetails(
                        ErrorCode.INVALID_PROGRAM_ACCOUNT,
                        'Target account is not an executable program',
                        {
                            programId: mutation.target,
                            error: programInfo ? 'Account is not executable' : 'Account does not exist'
                        }
                    )
                );
            }

            switch (mutation.type) {
                case MutationType.Arithmetic:
                    return await this.executeArithmeticMutation(mutation);
                case MutationType.AccessControl:
                    return await this.executeAccessControlMutation(mutation);
                case MutationType.Reentrancy:
                    return await this.executeReentrancyMutation(mutation);
                case MutationType.PDA:
                    return await this.executePDAMutation(mutation);
                case MutationType.Concurrency:
                    return await this.executeConcurrencyMutation(mutation);
                case MutationType.DataValidation:
                case MutationType.AccountValidation:
                case MutationType.CPIValidation:
                case MutationType.AuthorityValidation:
                case MutationType.SignerValidation:
                    return await this.executeValidationMutation(mutation);
                case MutationType.Custom:
                    return await this.executeCustomMutation(mutation);
                default:
                    throw createError(
                        ErrorCode.INVALID_MUTATION_TYPE,
                        `Unsupported mutation type: ${mutation.type}`,
                        this.createErrorDetails(
                            ErrorCode.INVALID_MUTATION_TYPE,
                            `Unsupported mutation type: ${mutation.type}`,
                            {
                                mutation: {
                                    type: mutation.type,
                                    target: mutation.target
                                },
                                securityContext: {
                                    environment: this.connection.rpcEndpoint.includes('mainnet') ? 'mainnet' : 'testnet'
                                }
                            }
                        )
                    );
            }
        } catch (error: unknown) {
            this.handleMutationError(mutation, error as Error);
        }
    }

    private createTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        switch (mutation.type) {
            case MutationType.Arithmetic:
                return this.createArithmeticTestInstruction(mutation);
            case MutationType.AccessControl:
                return this.createAccessControlTestInstruction(mutation);
            case MutationType.Reentrancy:
                return this.createReentrancyTestInstruction(mutation);
            case MutationType.PDA:
                return this.createPDAValidationTestInstruction(mutation);
            case MutationType.Concurrency:
                return this.createConcurrencyTestInstruction(mutation);
            case MutationType.Custom:
                return this.createCustomTestInstruction(mutation);
            default:
                throw createError(
                    ErrorCode.INVALID_MUTATION_TYPE,
                    `Unsupported mutation type: ${mutation.type}`,
                    this.createErrorDetails(
                        ErrorCode.INVALID_MUTATION_TYPE,
                        `Unsupported mutation type: ${mutation.type}`
                    )
                );
        }
    }

    private createArithmeticTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        const data = Buffer.from([0]); // Instruction index 0 for arithmetic tests
        const keys = [
            {
                pubkey: new PublicKey(mutation.target),
                isSigner: false,
                isWritable: true
            }
        ];

        if (typeof mutation.payload === 'number') {
            const valueBuffer = Buffer.alloc(8);
            valueBuffer.writeBigInt64LE(BigInt(mutation.payload));
            return new TransactionInstruction({
                keys,
                programId: this.programId,
                data: Buffer.concat([data, valueBuffer])
            });
        }

        const errorDetails: ErrorDetails = {
            code: ErrorCode.INVALID_MUTATION_PAYLOAD,
            message: 'Arithmetic test payload must be a number',
            metadata: {
                instruction: 'arithmetic_test',
                error: 'Invalid payload type',
                value: String(mutation.payload)
            }
        };

        throw createError(
            ErrorCode.INVALID_MUTATION_PAYLOAD,
            'Arithmetic test payload must be a number',
            errorDetails
        );
    }

    private createAccessControlTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        const data = Buffer.from([1]); // Instruction index 1 for access control tests
        const targetPubkey = new PublicKey(mutation.target);
        const unauthorizedSigner = mutation.payload instanceof PublicKey ? 
            mutation.payload : Keypair.generate().publicKey;

        return new TransactionInstruction({
            keys: [
                {
                    pubkey: targetPubkey,
                    isSigner: false,
                    isWritable: true
                },
                {
                    pubkey: unauthorizedSigner,
                    isSigner: true,
                    isWritable: false
                }
            ],
            programId: this.programId,
            data
        });
    }

    private createReentrancyTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        const data = Buffer.from([2]); // Instruction index 2 for reentrancy tests
        const targetPubkey = new PublicKey(mutation.target);

        return new TransactionInstruction({
            keys: [
                {
                    pubkey: targetPubkey,
                    isSigner: false,
                    isWritable: true
                },
                {
                    pubkey: this.programId,
                    isSigner: false,
                    isWritable: false
                }
            ],
            programId: this.programId,
            data: Buffer.concat([
                data,
                Buffer.from([mutation.payload === true ? 1 : 0]) // Boolean flag for reentrancy
            ])
        });
    }

    private createPDAValidationTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        const data = Buffer.from([3]); // Instruction index 3 for PDA validation tests
        const targetPubkey = new PublicKey(mutation.target);
        let seedBuffer: Buffer;

        if (mutation.payload instanceof Buffer) {
            seedBuffer = mutation.payload;
        } else if (typeof mutation.payload === 'string') {
            seedBuffer = Buffer.from(mutation.payload);
        } else {
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'PDA seed must be a Buffer or string',
                { metadata: { payload: mutation.payload } }
            );
        }

        return new TransactionInstruction({
            keys: [
                {
                    pubkey: targetPubkey,
                    isSigner: false,
                    isWritable: true
                }
            ],
            programId: this.programId,
            data: Buffer.concat([data, seedBuffer])
        });
    }

    private createConcurrencyTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        const data = Buffer.from([4]); // Instruction index 4 for concurrency tests
        const targetPubkey = new PublicKey(mutation.target);
        const numThreads = typeof mutation.payload === 'number' ? mutation.payload : 2;
        const threadCountBuffer = Buffer.alloc(4);
        threadCountBuffer.writeUInt32LE(numThreads);

        return new TransactionInstruction({
            keys: [
                {
                    pubkey: targetPubkey,
                    isSigner: false,
                    isWritable: true
                }
            ],
            programId: this.programId,
            data: Buffer.concat([data, threadCountBuffer])
        });
    }

    private createCustomTestInstruction(mutation: FuzzingMutation): TransactionInstruction {
        if (!mutation.metadata?.instruction) {
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'Custom test requires instruction data in metadata',
                this.createErrorDetails(
                    ErrorCode.INVALID_MUTATION_PAYLOAD,
                    'Custom test requires instruction data in metadata'
                )
            );
        }

        try {
            const parsedInstruction = this.parseInstruction(mutation.metadata.instruction);
            return new TransactionInstruction({
                keys: parsedInstruction.keys.map(key => ({
                    pubkey: new PublicKey(key.pubkey),
                    isSigner: key.isSigner,
                    isWritable: key.isWritable
                })),
                programId: this.programId,
                data: parsedInstruction.data
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'Failed to parse custom instruction',
                this.createErrorDetails(
                    ErrorCode.INVALID_MUTATION_PAYLOAD,
                    'Failed to parse custom instruction',
                    {
                        error: errorMessage,
                        instruction: mutation.metadata.instruction
                    }
                )
            );
        }
    }

    private async analyzeTestResult(
        success: boolean,
        mutation: FuzzingMutation
    ): Promise<VulnerabilityInfo[]> {
        const vulnerabilities: VulnerabilityInfo[] = [];

        if (!success) {
            const vulnerability = this.createVulnerability(mutation);
            vulnerabilities.push(vulnerability);
            this.metrics.vulnerabilitiesFound.push(vulnerability.vulnerabilityType);

            if (this.redis) {
                await this.redis.set(
                    `vulnerability:${vulnerability.id}`,
                    JSON.stringify(vulnerability)
                );
            }
        }

        return vulnerabilities;
    }

    private createVulnerability(mutation: FuzzingMutation): VulnerabilityInfo {
        const vulnerabilityType = mutation.expectedVulnerability || VulnerabilityType.Custom;
        return {
            id: `VULN-${Date.now()}`,
            name: this.getVulnerabilityName(mutation),
            description: this.getVulnerabilityDescription(mutation),
            severity: this.getVulnerabilitySeverity(mutation),
            confidence: 0.8,
            createdAt: new Date(),
            updatedAt: new Date(),
            evidence: [JSON.stringify(mutation)],
            recommendation: this.getVulnerabilityRecommendation(mutation),
            vulnerabilityType,
            details: {
                expectedValue: mutation.metadata?.expectedValue,
                actualValue: mutation.metadata?.actualValue,
                location: mutation.target,
                impact: 'High',
                likelihood: 'Medium'
            }
        };
    }

    private getVulnerabilityName(mutation: FuzzingMutation): string {
        return `${mutation.type} Vulnerability`;
    }

    private getVulnerabilitySeverity(mutation: FuzzingMutation): 'low' | 'medium' | 'high' | 'critical' {
        switch (mutation.securityImpact) {
            case 'CRITICAL':
                return 'critical';
            case 'HIGH':
                return 'high';
            case 'MEDIUM':
                return 'medium';
            case 'LOW':
                return 'low';
            default:
                return 'medium';
        }
    }

    private getVulnerabilityDescription(mutation: FuzzingMutation): string {
        switch (mutation.type) {
            case MutationType.Arithmetic:
                return 'Potential arithmetic overflow/underflow vulnerability detected';
            case MutationType.AccessControl:
                return 'Potential access control vulnerability detected';
            case MutationType.Reentrancy:
                return 'Potential reentrancy vulnerability detected';
            case MutationType.PDA:
                return 'Potential PDA validation vulnerability detected';
            case MutationType.Concurrency:
                return 'Potential concurrency vulnerability detected';
            case MutationType.Custom:
                return 'Custom vulnerability test failed';
            default:
                return 'Unknown vulnerability type detected';
        }
    }

    private getVulnerabilityRecommendation(mutation: FuzzingMutation): string {
        switch (mutation.type) {
            case MutationType.Arithmetic:
                return 'Implement proper arithmetic checks and use safe math operations';
            case MutationType.AccessControl:
                return 'Review and strengthen access control mechanisms';
            case MutationType.Reentrancy:
                return 'Implement reentrancy guards and follow checks-effects-interactions pattern';
            case MutationType.PDA:
                return 'Implement proper PDA validation and ownership checks';
            case MutationType.Concurrency:
                return 'Implement proper synchronization mechanisms';
            case MutationType.Custom:
                return 'Review custom test failure and implement appropriate fixes';
            default:
                return 'Review and fix the identified vulnerability';
        }
    }

    public async testScenario(config: FuzzingConfig): Promise<FuzzingResult> {
        const payer = Keypair.generate();
        const startTime = Date.now();
        const vulnerabilities: VulnerabilityInfo[] = [];
        let success = true;

        try {
            const mutations = config.customMutations || this.generateMutations(config);
            
            for (const mutation of mutations) {
                this.metrics.totalTests++;
                
                const instruction = this.createTestInstruction(mutation);
                const testSuccess = await this.executeTestTransaction(instruction, payer);
                
                if (testSuccess) {
                    this.metrics.successfulExecutions++;
                } else {
                    this.metrics.failedExecutions++;
                    success = false;
                }

                const testVulnerabilities = await this.analyzeTestResult(testSuccess, mutation);
                vulnerabilities.push(...testVulnerabilities);

                if (config.maxIterations && this.metrics.totalTests >= config.maxIterations) {
                    break;
                }
            }

            const endTime = Date.now();
            this.metrics.executionTime = (endTime - startTime) / this.metrics.totalTests;

            return {
                success,
                vulnerabilities,
                expectedVulnerabilities: [],
                metrics: this.metrics,
            };
        } catch (error) {
            throw new GlitchError(
                'Failed to execute chaos test scenario',
                ErrorCode.TEST_EXECUTION_FAILED,
                {
                    code: ErrorCode.TEST_EXECUTION_FAILED,
                    message: 'Failed to execute chaos test scenario',
                    metadata: { error }
                }
            );
        }
    }

    private generateMutations(config: FuzzingConfig): FuzzingMutation[] {
        const mutations: FuzzingMutation[] = [];
        const mutationTypes = config.mutationTypes || Object.values(MutationType);

        for (const type of mutationTypes) {
            const payload = this.generateMutationPayload(type);
            mutations.push({
                type,
                target: this.programId.toBase58(),
                payload,
                securityImpact: 'HIGH',
                description: this.getVulnerabilityDescription({ 
                    type, 
                    target: this.programId.toBase58(), 
                    payload, 
                    securityImpact: 'HIGH', 
                    description: '' 
                } as FuzzingMutation),
                metadata: {
                    instruction: this.getDefaultInstructionForType(type)
                }
            });
        }

        return mutations;
    }

    private generateMutationPayload(type: MutationType): string | number | boolean | null {
        switch (type) {
            case MutationType.Arithmetic:
                return Number.MAX_SAFE_INTEGER;
            case MutationType.AccessControl:
                return Keypair.generate().publicKey.toBase58();
            case MutationType.Reentrancy:
                return true;
            case MutationType.PDA:
                return Buffer.from('invalid_seed').toString('hex');
            case MutationType.Concurrency:
                return 10;
            case MutationType.DataValidation:
                return Buffer.from('invalid_data').toString('hex');
            case MutationType.AccountValidation:
                return Buffer.from('invalid_account').toString('hex');
            case MutationType.CPIValidation:
                return Buffer.from('invalid_cpi').toString('hex');
            case MutationType.AuthorityValidation:
                return Buffer.from('invalid_authority').toString('hex');
            case MutationType.SignerValidation:
                return Buffer.from('invalid_signer').toString('hex');
            case MutationType.Custom:
            default:
                return null;
        }
    }

    public async close(): Promise<void> {
        if (this.redis) {
            await this.redis.quit();
        }
    }

    private async executeValidationMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            let result: ValidationResult;

            switch (mutation.type) {
                case MutationType.DataValidation:
                    result = await this.testDataValidation(targetPubkey, mutation.payload);
                    if (result.vulnerable) {
                        this.addVulnerability(VulnerabilityType.DataValidation);
                    }
                    break;
                case MutationType.AccountValidation:
                    result = await this.testAccountValidation(targetPubkey, mutation.payload);
                    if (result.vulnerable) {
                        this.addVulnerability(VulnerabilityType.AccountValidation);
                    }
                    break;
                case MutationType.CPIValidation:
                    result = await this.testCPIValidation(targetPubkey, mutation.payload);
                    if (result.vulnerable) {
                        this.addVulnerability(VulnerabilityType.CPIValidation);
                    }
                    break;
                case MutationType.AuthorityValidation:
                    result = await this.testAuthorityValidation(targetPubkey, mutation.payload);
                    if (result.vulnerable) {
                        this.addVulnerability(VulnerabilityType.AuthorityValidation);
                    }
                    break;
                case MutationType.SignerValidation:
                    result = await this.testSignerValidation(targetPubkey, mutation.payload);
                    if (result.vulnerable) {
                        this.addVulnerability(VulnerabilityType.SignerValidation);
                    }
                    break;
                default:
                    throw createError(
                        ErrorCode.INVALID_MUTATION_TYPE,
                        'Unsupported validation mutation type',
                        this.createErrorDetails(
                            ErrorCode.INVALID_MUTATION_TYPE,
                            'Unsupported validation mutation type'
                        )
                    );
            }

            return result.vulnerable;
        } catch (error: unknown) {
            this.handleMutationError(mutation, error as Error);
        }
    }

    private async executeArithmeticMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            const result = await this.testArithmeticOperation(targetPubkey, mutation.payload);
            if (result.vulnerable) {
                this.addVulnerability(VulnerabilityType.ArithmeticOverflow);
            }
            return result.vulnerable;
        } catch (error: unknown) {
            this.handleMutationError(mutation, error as Error);
        }
    }

    private async executeAccessControlMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            const result = await this.testAccessControl(targetPubkey, mutation.payload);
            if (result.vulnerable) {
                this.addVulnerability(VulnerabilityType.AccessControl);
            }
            return result.vulnerable;
        } catch (error) {
            throw createError(
                ErrorCode.MUTATION_EXECUTION_FAILED,
                'Access control mutation failed',
                { metadata: { error } }
            );
        }
    }

    private async executeReentrancyMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            const result = await this.testReentrancy(targetPubkey, mutation.payload);
            if (result.vulnerable) {
                this.addVulnerability(VulnerabilityType.Reentrancy);
            }
            return result.vulnerable;
        } catch (error) {
            throw createError(
                ErrorCode.MUTATION_EXECUTION_FAILED,
                'Reentrancy mutation failed',
                { metadata: { error } }
            );
        }
    }

    private async executePDAMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            const result = await this.testPDAValidation(targetPubkey, mutation.payload);
            if (result.vulnerable) {
                this.addVulnerability(VulnerabilityType.PDASafety);
            }
            return result.vulnerable;
        } catch (error) {
            throw createError(
                ErrorCode.MUTATION_EXECUTION_FAILED,
                'PDA mutation failed',
                { metadata: { error } }
            );
        }
    }

    private async executeConcurrencyMutation(mutation: FuzzingMutation): Promise<boolean> {
        try {
            const targetPubkey = this.validateAndGetPubkey(mutation.target);
            const result = await this.testConcurrency(targetPubkey, mutation.payload);
            if (result.vulnerable) {
                this.addVulnerability(VulnerabilityType.RaceCondition);
            }
            return result.vulnerable;
        } catch (error) {
            throw createError(
                ErrorCode.MUTATION_EXECUTION_FAILED,
                'Concurrency mutation failed',
                { metadata: { error } }
            );
        }
    }

    private async executeCustomMutation(mutation: FuzzingMutation): Promise<boolean> {
        if (!mutation.metadata?.instruction) {
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'Custom mutation requires instruction metadata',
                {
                    code: ErrorCode.INVALID_MUTATION_PAYLOAD,
                    message: 'Custom mutation requires instruction metadata'
                }
            );
        }

        try {
            const result = await this.testCustomScenario(mutation.metadata.instruction, mutation.payload);
            if (result.vulnerable && mutation.expectedVulnerability) {
                this.addVulnerability(mutation.expectedVulnerability);
            }
            return result.vulnerable;
        } catch (error: unknown) {
            this.handleMutationError(mutation, error as Error);
        }
    }

    private validateAndGetPubkey(input: string | undefined): PublicKey {
        if (!input) {
            throw createError(
                ErrorCode.INVALID_MUTATION_TARGET,
                'Target public key is required',
                this.createErrorDetails(
                    ErrorCode.INVALID_MUTATION_TARGET,
                    'Target public key is required'
                )
            );
        }
        try {
            return new PublicKey(input);
        } catch (error) {
            throw createError(
                ErrorCode.INVALID_MUTATION_TARGET,
                'Invalid public key format',
                this.createErrorDetails(
                    ErrorCode.INVALID_MUTATION_TARGET,
                    'Invalid public key format',
                    undefined,
                    error
                )
            );
        }
    }

    private addVulnerability(vulnerability: VulnerabilityType): void {
        if (!this.metrics.vulnerabilitiesFound.includes(vulnerability)) {
            this.metrics.vulnerabilitiesFound.push(vulnerability);
        }
    }

    // Test execution methods
    private async testDataValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement data validation testing logic
        return { vulnerable: false };
    }

    private async testAccountValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement account validation testing logic
        return { vulnerable: false };
    }

    private async testCPIValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement CPI validation testing logic
        return { vulnerable: false };
    }

    private async testAuthorityValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement authority validation testing logic
        return { vulnerable: false };
    }

    private async testSignerValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement signer validation testing logic
        return { vulnerable: false };
    }

    private async testArithmeticOperation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement arithmetic overflow/underflow testing logic
        return { vulnerable: false };
    }

    private async testAccessControl(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement access control testing logic
        return { vulnerable: false };
    }

    private async testReentrancy(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement reentrancy testing logic
        return { vulnerable: false };
    }

    private async testPDAValidation(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement PDA validation testing logic
        return { vulnerable: false };
    }

    private async testConcurrency(target: PublicKey, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement concurrency testing logic
        return { vulnerable: false };
    }

    private async testCustomScenario(instruction: string, payload: string | number | boolean | null): Promise<ValidationResult> {
        // Implement custom scenario testing logic
        return { vulnerable: false };
    }

    private createBaseMutation(type: MutationType, target: string, payload: unknown): FuzzingMutation {
        if (!target) {
            throw createError(
                ErrorCode.INVALID_MUTATION_TARGET,
                'Target is required for mutation'
            );
        }
        if (!payload) {
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'Payload is required for mutation'
            );
        }
        return {
            type,
            target,
            payload,
            securityImpact: 'HIGH',
            description: this.getVulnerabilityDescription({ type, target, payload, securityImpact: 'HIGH', description: '' } as FuzzingMutation)
        };
    }

    private parseInstruction(instructionStr: string): { data: Buffer; keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean; }> } {
        try {
            const instruction = JSON.parse(instructionStr) as { 
                data: string | number[]; 
                keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean; }> 
            };

            const data = typeof instruction.data === 'string' 
                ? Buffer.from(instruction.data, 'hex')
                : Buffer.from(instruction.data);

            return {
                data,
                keys: instruction.keys.map(key => ({
                    pubkey: key.pubkey,
                    isSigner: Boolean(key.isSigner),
                    isWritable: Boolean(key.isWritable)
                }))
            };
        } catch (error) {
            throw createError(
                ErrorCode.INVALID_MUTATION_PAYLOAD,
                'Invalid instruction format',
                {
                    code: ErrorCode.INVALID_MUTATION_PAYLOAD,
                    message: 'Invalid instruction format',
                    metadata: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        instruction: instructionStr
                    }
                }
            );
        }
    }

    private getDefaultInstructionForType(type: MutationType): string {
        switch (type) {
            case MutationType.Arithmetic:
                return 'arithmetic_operation';
            case MutationType.AccessControl:
                return 'authority_check';
            case MutationType.Reentrancy:
                return 'cross_program_invocation';
            case MutationType.PDA:
                return 'pda_validation';
            case MutationType.Concurrency:
                return 'concurrent_operation';
            case MutationType.DataValidation:
                return 'data_validation';
            case MutationType.AccountValidation:
                return 'account_validation';
            case MutationType.CPIValidation:
                return 'cpi_validation';
            case MutationType.AuthorityValidation:
                return 'authority_validation';
            case MutationType.SignerValidation:
                return 'signer_validation';
            case MutationType.Custom:
                return 'custom_instruction';
            default:
                return 'unknown_instruction';
        }
    }
} 
