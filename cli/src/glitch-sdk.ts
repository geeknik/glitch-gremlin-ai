import { TestType } from './types';

export class GlitchSDK {
    private cluster: string;
    private wallet: any;

    constructor(config: { cluster: string; wallet: any }) {
        this.cluster = config.cluster;
        this.wallet = config.wallet;
    }

    async createChaosRequest(params: {
        targetProgram: string;
        testType: TestType | string;
        duration: number;
        intensity: number;
    }) {
        return {
            requestId: 'test-request-id',
            id: 'test-id',
            waitForCompletion: async () => ({
                success: true,
                vulnerabilities: [],
                resultRef: 'ipfs://test',
                logs: ['Test completed'],
                metrics: {
                    totalTransactions: 100,
                    errorRate: 0.05,
                    avgLatency: 200
                }
            })
        };
    }
}
