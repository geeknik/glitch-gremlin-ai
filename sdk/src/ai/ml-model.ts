import * as tf from '@tensorflow/tfjs-node';
import type { Sequential, LayersModel } from '@tensorflow/tfjs-layers';
import type { Tensor } from '@tensorflow/tfjs-core';
import { VulnerabilityType } from './types.js';
import { Tensor as TensorNode } from '@tensorflow/tfjs-node';

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
    details: string[];
}

export interface MLConfig {
    inputShape: number[];
    hiddenLayers: number[];
    outputShape: number;
    learningRate: number;
}

export interface TrainConfig {
    epochs: number;
    batchSize: number;
    validationSplit?: number;
    verbose?: number;
}

/**
 * Base class for all machine learning models in the system
 */
export abstract class MLModel {
    protected model: tf.Sequential;
    protected readonly config: MLConfig;
    protected initialized: boolean;

    constructor(config: MLConfig) {
        this.config = config;
        this.initialized = false;
        this.model = this.buildModel();
    }

    protected buildModel(): tf.Sequential {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: this.config.inputShape
        }));

        // Hidden layers
        for (let i = 1; i < this.config.hiddenLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.config.hiddenLayers[i],
                activation: 'relu'
            }));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: this.config.outputShape,
            activation: 'softmax'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        this.initialized = true;
        return model;
    }

    public async train(
        x: tf.Tensor | number[][],
        y: tf.Tensor | number[][],
        config: TrainConfig
    ): Promise<tf.History> {
        if (!this.initialized) {
            throw new Error('Model not initialized');
        }

        const xs = Array.isArray(x) ? tf.tensor2d(x) : x;
        const ys = Array.isArray(y) ? tf.tensor2d(y) : y;

        try {
            return await this.model.fit(xs, ys, {
                epochs: config.epochs,
                batchSize: config.batchSize,
                validationSplit: config.validationSplit || 0.1,
                verbose: config.verbose || 1
            });
        } finally {
            if (Array.isArray(x)) xs.dispose();
            if (Array.isArray(y)) ys.dispose();
        }
    }

    public async predict(x: tf.Tensor | number[][]): Promise<tf.Tensor> {
        if (!this.initialized) {
            throw new Error('Model not initialized');
        }

        const xs = Array.isArray(x) ? tf.tensor2d(x) : x;
        try {
            return this.model.predict(xs) as tf.Tensor;
        } finally {
            if (Array.isArray(x)) xs.dispose();
        }
    }

    public async save(path: string): Promise<void> {
        if (!this.initialized) {
            throw new Error('Model not initialized');
        }
        await this.model.save(`file://${path}`);
    }

    public async load(path: string): Promise<void> {
        const loadedModel = await tf.loadLayersModel(`file://${path}`);
        if (!(loadedModel instanceof tf.Sequential)) {
            throw new Error('Loaded model is not a Sequential model');
        }
        this.model = loadedModel;
        this.model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        this.initialized = true;
    }

    public dispose(): void {
        if (this.initialized && this.model) {
            this.model.dispose();
            this.initialized = false;
        }
    }

    public getConfig(): MLConfig {
        return { ...this.config };
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    protected async calculateModelHash(): Promise<string> {
        if (!this.initialized) {
            throw new Error('Model not initialized');
        }
        
        // Get model weights as a concatenated array
        const weights = this.model.getWeights();
        const weightData = await Promise.all(
            weights.map(w => w.data())
        );
        
        // Create a hash of the weights
        const weightString = weightData
            .map(d => Array.from(d).join(','))
            .join('|');
            
        return Buffer.from(weightString).toString('base64');
    }

    protected mapVulnerabilityType(prediction: number): VulnerabilityType {
        switch (prediction) {
            case 0:
                return VulnerabilityType.Reentrancy;
            case 1:
                return VulnerabilityType.AccessControl;
            case 2:
                return VulnerabilityType.ArithmeticOverflow;
            case 3:
                return VulnerabilityType.PdaSafety;
            case 4:
                return VulnerabilityType.CpiSafety;
            case 5:
                return VulnerabilityType.SignerAuthorization;
            case 6:
                return VulnerabilityType.AuthorityCheck;
            case 7:
                return VulnerabilityType.DataValidation;
            case 8:
                return VulnerabilityType.AccountValidation;
            default:
                return VulnerabilityType.None;
        }
    }
}

export class VulnerabilityDetectionModel extends MLModel {
    constructor() {
        const config: MLConfig = {
            inputShape: [20],
            hiddenLayers: [64, 32],
            outputShape: Object.keys(VulnerabilityType).length,
            learningRate: 0.001
        };
        super(config);
    }

    public async trainOnBatch(data: { features: number[]; label: VulnerabilityType }[]): Promise<{ loss: number }> {
        const features = data.map(d => d.features);
        const labels = data.map(d => this.oneHotEncode(d.label));
        
        const history = await this.train(features, labels, {
            epochs: 1,
            batchSize: data.length
        });
        
        // Extract loss value from history and ensure it's a number
        const lossValue = Array.isArray(history.history.loss) 
            ? history.history.loss[0] 
            : history.history.loss;
            
        const loss = typeof lossValue === 'number' ? lossValue : 0;
        
        return { loss };
    }

    public async predictVulnerability(features: number[]): Promise<PredictionResult> {
        const prediction = await this.predict([features]);
        const predictionData = await prediction.data();
        
        // Get the index of the highest probability
        const maxIndex = Array.from(predictionData).indexOf(Math.max(...Array.from(predictionData)));
        const vulnerabilityType = this.mapVulnerabilityType(maxIndex);
        
        return {
            type: vulnerabilityType,
            confidence: predictionData[maxIndex],
            details: this.generateDetails(vulnerabilityType, predictionData[maxIndex])
        };
    }

    private oneHotEncode(vulnerabilityType: VulnerabilityType): number[] {
        const numClasses = Object.keys(VulnerabilityType).length;
        const index = Object.values(VulnerabilityType).indexOf(vulnerabilityType);
        return Array(numClasses).fill(0).map((_, i) => i === index ? 1 : 0);
    }

    private generateDetails(type: VulnerabilityType, confidence: number): string[] {
        const details = [`Detected vulnerability type: ${type}`];
        details.push(`Confidence score: ${(confidence * 100).toFixed(2)}%`);

        details.push('Recommendations:');
        switch (type) {
            case VulnerabilityType.Reentrancy:
                details.push('- Implement checks-effects-interactions pattern');
                details.push('- Use reentrancy guards');
                details.push('- Update state before external calls');
                break;
            case VulnerabilityType.AccessControl:
                details.push('- Implement proper authorization checks');
                details.push('- Use role-based access control');
                details.push('- Add multi-signature requirements for critical operations');
                break;
            case VulnerabilityType.ArithmeticOverflow:
                details.push('- Use checked math operations');
                details.push('- Implement value range validation');
                details.push('- Add overflow checks for critical calculations');
                break;
            case VulnerabilityType.PdaSafety:
                details.push('- Validate PDA derivation');
                details.push('- Check bump seeds');
                details.push('- Verify PDA ownership');
                break;
            case VulnerabilityType.CpiSafety:
                details.push('- Validate CPI target programs');
                details.push('- Check program ownership');
                details.push('- Verify account permissions');
                break;
            case VulnerabilityType.SignerAuthorization:
                details.push('- Implement proper authorization checks');
                details.push('- Use role-based access control');
                details.push('- Add multi-signature requirements for critical operations');
                break;
            case VulnerabilityType.AuthorityCheck:
                details.push('- Implement proper authorization checks');
                details.push('- Use role-based access control');
                details.push('- Add multi-signature requirements for critical operations');
                break;
            case VulnerabilityType.DataValidation:
                details.push('- Implement data validation');
                details.push('- Use data validation libraries');
                details.push('- Verify data integrity');
                break;
            case VulnerabilityType.AccountValidation:
                details.push('- Implement account validation');
                details.push('- Use account validation libraries');
                details.push('- Verify account integrity');
                break;
            default:
                details.push('- Review code for potential security issues');
                details.push('- Consider security audit');
                break;
        }

        return details;
    }

    public async cleanup(): Promise<void> {
        this.dispose();
    }
}
