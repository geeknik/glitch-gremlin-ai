export interface GlitchSDKConfig {
    cluster?: string;
    wallet?: any;
    modelPath?: string;
}

export class GlitchSDK {
    private constructor(config: GlitchSDKConfig) {
        // Initialize with config
    }

    static async init(config: GlitchSDKConfig): Promise<GlitchSDK> {
        return new GlitchSDK(config);
    }
}

export default GlitchSDK;

