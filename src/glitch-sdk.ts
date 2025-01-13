import { TestType } from './types.js';

export interface GlitchSDKConfig {
    cluster?: string;
    wallet?: any;
    modelPath?: string;
}

export interface ChaosRequest {
    id: string;
    targetProgram: string;
    testType: TestType;
    duration: number;
    intensity: number;
}

export class GlitchSDK {
    private config: GlitchSDKConfig;

    constructor(config: GlitchSDKConfig) {
        this.config = config;
    }

    async createChaosRequest(params: {
        targetProgram: string;
        testType: TestType;
        duration: number;
        intensity: number;
    }): Promise<{ 
        id: string;
        waitForCompletion: () => Promise<any>;
    }> {
        // Implementation will be added later
        const id = Math.random().toString(36).substring(7);
        return {
            id,
            waitForCompletion: async () => ({
                status: 'completed',
                results: {}
            })
        };
    }
}

export default GlitchSDK;

