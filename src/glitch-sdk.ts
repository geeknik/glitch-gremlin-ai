import { 
TestType, 
GlitchError, 
ValidationError, 
TimeoutError,
TestStatus,
MutationTestResult,
MutationTestParams,
ChaosTestConfig,
RequestStatus
} from './types.js';

export interface GlitchSDKConfig {
cluster: string;
wallet: any; // Should be proper wallet type based on your wallet implementation
modelPath?: string;
timeout?: number;
maxRetries?: number;
}

const DEFAULT_CONFIG: Partial<GlitchSDKConfig> = {
timeout: 300000, // 5 minutes
maxRetries: 3
};

export class GlitchSDK {
private config: GlitchSDKConfig;
private requests: Map<string, RequestStatus>;

constructor(config: GlitchSDKConfig) {
    this.validateConfig(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.requests = new Map();
}

private validateConfig(config: GlitchSDKConfig): void {
    if (!config.cluster) {
    throw new ValidationError('Cluster URL is required');
    }
    if (!config.wallet) {
    throw new ValidationError('Wallet is required');
    }
}

private validateTestParams(params: MutationTestParams): void {
    if (params.duration < 60 || params.duration > 3600) {
    throw new ValidationError('Duration must be between 60 and 3600 seconds');
    }

    if (params.intensity < 1 || params.intensity > 10) {
    throw new ValidationError('Intensity must be between 1 and 10');
    }

    if (!/^[A-Za-z0-9]{43,44}$/.test(params.targetProgram)) {
    throw new ValidationError('Invalid program ID format');
    }
}

async createChaosRequest(params: MutationTestParams): Promise<{
    id: string;
    status: TestStatus;
    waitForCompletion: (options?: { signal?: AbortSignal }) => Promise<MutationTestResult>;
}> {
    try {
        this.validateTestParams(params);
        
        const id = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const status: RequestStatus = {
            id,
            status: TestStatus.PENDING,
            startTime: Date.now(),
            params
        };
        
        this.requests.set(id, status);

        const waitForCompletion = async (options?: { signal?: AbortSignal }): Promise<MutationTestResult> => {
            try {
                const result = await global.security.mutation.test({
                    program: params.targetProgram,
                    duration: params.duration,
                    intensity: params.intensity
                });

                this.requests.get(id)!.status = TestStatus.COMPLETED;
                this.requests.get(id)!.result = result;
                
                return result;
            } catch (error) {
                this.requests.get(id)!.status = TestStatus.FAILED;
                this.requests.get(id)!.error = error;
                
                if (error instanceof TimeoutError) {
                    throw error;
                }
                
                if (error instanceof Error) {
                    throw new GlitchError(error.message);
                }
                
                throw new GlitchError('Mutation test failed');
            }
        };

        return {
            id,
            status: TestStatus.PENDING,
            waitForCompletion
        };
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        throw new GlitchError('Failed to create chaos request');
    }
}

private createTestConfig(): ChaosTestConfig {
    return {
    cluster: this.config.cluster,
    wallet: this.config.wallet,
    modelPath: this.config.modelPath,
    maxRetries: this.config.maxRetries
    };
}

getRequestStatus(id: string): RequestStatus {
    const status = this.requests.get(id);
    if (!status) {
    throw new ValidationError(`Request ${id} not found`);
    }
    return status;
}
}

export default GlitchSDK;
