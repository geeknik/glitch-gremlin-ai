import * as tf from '@tensorflow/tfjs-node';
import type { Sequential, LayersModel, History, Callback, EarlyStopping } from '@tensorflow/tfjs-layers';
import type { Tensor, Tensor2D, Rank } from '@tensorflow/tfjs-core';
import { VulnerabilityType, SecurityLevel } from '../types';
import { Tensor as TensorNode } from '@tensorflow/tfjs-node';

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
    details: string[];
    metadata?: {
        modelVersion: string;
        timestamp: number;
        computeTime: number;
    };
}

export interface TrainConfig {
    epochs: number;
    batchSize: number;
    validationSplit?: number;
    verbose?: number;
    earlyStoppingPatience?: number;
    modelCheckpoint?: boolean;
}

export interface MLConfig {
    inputShape: number[];
    hiddenLayers: number[];
    outputShape: number;
    learningRate: number;
    dropoutRate?: number;
    l2Regularization?: number;
    batchNormalization?: boolean;
}

export class MLError extends Error {
    constructor(message: string, public readonly code: string, public readonly details?: any) {
        super(message);
        this.name = 'MLError';
    }
}

/**
 * Base class for all machine learning models in the system
 */
export abstract class MLModel {
    protected model: tf.Sequential;
    protected readonly config: MLConfig;
    protected initialized: boolean;
    protected modelVersion: string;

    constructor(config: MLConfig) {
        this.validateConfig(config);
        this.config = config;
        this.initialized = false;
        this.modelVersion = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.model = this.buildModel();
    }

    private validateConfig(config: MLConfig): void {
        if (!config.inputShape || !Array.isArray(config.inputShape) || config.inputShape.length === 0) {
            throw new MLError('Invalid input shape', 'INVALID_CONFIG', { field: 'inputShape' });
        }
        if (!config.hiddenLayers || !Array.isArray(config.hiddenLayers) || config.hiddenLayers.length === 0) {
            throw new MLError('Invalid hidden layers configuration', 'INVALID_CONFIG', { field: 'hiddenLayers' });
        }
        if (typeof config.outputShape !== 'number' || config.outputShape <= 0) {
            throw new MLError('Invalid output shape', 'INVALID_CONFIG', { field: 'outputShape' });
        }
        if (typeof config.learningRate !== 'number' || config.learningRate <= 0) {
            throw new MLError('Invalid learning rate', 'INVALID_CONFIG', { field: 'learningRate' });
        }
    }

    protected buildModel(): tf.Sequential {
        const model = tf.sequential();

        try {
            // Input layer with regularization
            const inputLayer = tf.layers.dense({
                units: this.config.hiddenLayers[0],
                activation: 'relu',
                inputShape: this.config.inputShape,
                kernelRegularizer: this.config.l2Regularization ? 
                    tf.regularizers.l2({ l2: this.config.l2Regularization }) : 
                    undefined
            });
            model.add(inputLayer);

            // Add normalization and dropout if configured
            if (this.config.batchNormalization) {
                const normLayer = tf.layers.dense({
                    units: this.config.hiddenLayers[0],
                    activation: 'linear',
                    useBias: false
                });
                model.add(normLayer);
            }

            if (this.config.dropoutRate) {
                const dropout = tf.layers.dropout({ rate: this.config.dropoutRate });
                model.add(dropout);
            }

            // Hidden layers
            for (let i = 1; i < this.config.hiddenLayers.length; i++) {
                const hiddenLayer = tf.layers.dense({
                    units: this.config.hiddenLayers[i],
                    activation: 'relu',
                    kernelRegularizer: this.config.l2Regularization ? 
                        tf.regularizers.l2({ l2: this.config.l2Regularization }) : 
                        undefined
                });
                model.add(hiddenLayer);

                if (this.config.batchNormalization) {
                    const normLayer = tf.layers.dense({
                        units: this.config.hiddenLayers[i],
                        activation: 'linear',
                        useBias: false
                    });
                    model.add(normLayer);
                }

                if (this.config.dropoutRate) {
                    const dropout = tf.layers.dropout({ rate: this.config.dropoutRate });
                    model.add(dropout);
                }
            }

            // Output layer
            const outputLayer = tf.layers.dense({
                units: this.config.outputShape,
                activation: 'softmax'
            });
            model.add(outputLayer);

            // Compile model
            model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            this.initialized = true;
            return model;
        } catch (error) {
            throw new MLError(
                'Failed to build model',
                'MODEL_BUILD_ERROR',
                { originalError: error instanceof Error ? error.message : String(error) }
            );
        }
    }

    public async train(
        x: tf.Tensor | number[][],
        y: tf.Tensor | number[][],
        config: TrainConfig
    ): Promise<History> {
        if (!this.initialized) {
            throw new MLError('Model not initialized', 'MODEL_NOT_INITIALIZED');
        }

        let inputTensor: tf.Tensor | null = null;
        let labelTensor: tf.Tensor | null = null;

        try {
            // Convert inputs to tensors if needed
            inputTensor = Array.isArray(x) ? tf.tensor2d(x) : x;
            labelTensor = Array.isArray(y) ? tf.tensor2d(y) : y;

            if (!inputTensor || !labelTensor) {
                throw new MLError('Invalid input tensors', 'INVALID_INPUT');
            }

            const callbacks: Callback[] = [];
            
            // Add early stopping if configured
            if (config.earlyStoppingPatience) {
                const earlyStopping = tf.callbacks.earlyStopping({
                    monitor: 'val_loss',
                    patience: config.earlyStoppingPatience
                });
                callbacks.push(earlyStopping);
            }

            // Train the model
            const result = await this.model.fit(inputTensor, labelTensor, {
                epochs: config.epochs,
                batchSize: config.batchSize,
                validationSplit: config.validationSplit || 0.1,
                verbose: config.verbose || 1,
                callbacks: callbacks.length > 0 ? callbacks : undefined
            });

            return result;
        } catch (error) {
            throw new MLError(
                'Training failed',
                'TRAINING_ERROR',
                { originalError: error instanceof Error ? error.message : String(error) }
            );
        } finally {
            // Clean up tensors
            if (inputTensor) {
                inputTensor.dispose();
            }
            if (labelTensor) {
                labelTensor.dispose();
            }
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
                return VulnerabilityType.PDASafety;
            case 4:
                return VulnerabilityType.CPISafety;
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

    protected getRecommendations(type: VulnerabilityType): string[] {
        const details: string[] = [];
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
            case VulnerabilityType.PDASafety:
                details.push('- Validate PDA derivation');
                details.push('- Check bump seeds');
                details.push('- Verify PDA ownership');
                break;
            case VulnerabilityType.CPISafety:
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
        const labels = data.map(d => this.encodeVulnerabilityType(d.label));
        
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
            details: this.getRecommendations(vulnerabilityType)
        };
    }

    private encodeVulnerabilityType(vulnerabilityType: VulnerabilityType): number[] {
        const numClasses = Object.keys(VulnerabilityType).length;
        const index = Object.values(VulnerabilityType).indexOf(vulnerabilityType);
        const encoded = new Array(numClasses).fill(0);
        encoded[index] = 1;
        return encoded;
    }

    public async cleanup(): Promise<void> {
        this.dispose();
    }
}
