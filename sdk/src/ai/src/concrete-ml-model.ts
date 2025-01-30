import * as tf from '@tensorflow/tfjs-node';
import { ModelConfig, ModelMetadata, PredictionResult, TrainingResult, VulnerabilityType } from '../types.js';
import * as fs from 'fs';

export class ConcreteMLModel {
    private model: tf.Sequential | null = null;
    private config: ModelConfig;
    private metadata: ModelMetadata | null = null;

    constructor(config: ModelConfig) {
        this.validateConfig(config);
        this.config = config;
    }

    private validateConfig(config: ModelConfig) {
        if (config.learningRate <= 0) {
            throw new Error('Learning rate must be positive');
        }
        if (!config.hiddenLayers || config.hiddenLayers.length === 0) {
            throw new Error('Must specify at least one hidden layer');
        }
    }

    async initialize(): Promise<void> {
        if (this.model) {
            return;
        }

        this.model = tf.sequential();
        
        // Input layer
        this.model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: [this.config.inputShape[0]]
        }));

        // Hidden layers
        for (let i = 1; i < this.config.hiddenLayers.length; i++) {
            this.model.add(tf.layers.dense({
                units: this.config.hiddenLayers[i],
                activation: 'relu'
            }));
        }

        // Output layer
        this.model.add(tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
        }));

        this.model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        this.metadata = {
            version: '1.0.0',
            createdAt: new Date(),
            lastTrainedAt: new Date(),
            metrics: {
                accuracy: 0,
                loss: 0,
                samples: 0
            },
            config: this.config
        };
    }

    async train(features: number[][], labels: number[]): Promise<TrainingResult> {
        if (!this.model) {
            await this.initialize();
        }

        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels.map(l => [l]));

        const result = await this.model!.fit(xs, ys, {
            epochs: this.config.epochs,
            batchSize: this.config.batchSize,
            validationSplit: 0.1,
            verbose: 1
        });

        const lastEpoch = result.history.loss.length - 1;
        
        if (this.metadata) {
            this.metadata.lastTrainedAt = new Date();
            this.metadata.metrics = {
                accuracy: Number(result.history.acc[lastEpoch]),
                loss: Number(result.history.loss[lastEpoch]),
                samples: features.length
            };
        }

        xs.dispose();
        ys.dispose();

        const startTime = Date.now();
        return {
            loss: Number(result.history.loss[lastEpoch]),
            accuracy: Number(result.history.acc[lastEpoch]),
            epoch: lastEpoch,
            epochs: this.config.epochs,
            duration: Date.now() - startTime,
            modelVersion: this.metadata?.version || '1.0.0',
            validationLoss: result.history.val_loss ? Number(result.history.val_loss[lastEpoch]) : undefined,
            validationAccuracy: result.history.val_acc ? Number(result.history.val_acc[lastEpoch]) : undefined
        };
    }

    public async predict(features: number[][]): Promise<PredictionResult> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }

        if (!Array.isArray(features) || !Array.isArray(features[0])) {
            throw new Error('Features must be a 2D array (batch of feature vectors)');
        }

        const xs = tf.tensor2d(features);
        const prediction = await this.model.predict(xs) as tf.Tensor;
        const values = await prediction.data();

        xs.dispose();
        prediction.dispose();

        const predictionValues = Array.from(values);
        return {
            prediction: predictionValues,
            confidence: Number(values[0]),
            vulnerabilityType: this.mapPredictionToVulnerability(predictionValues),
            details: {
                expectedValue: 0.5,
                actualValue: Number(values[0]),
                deviation: Math.abs(0.5 - Number(values[0]))
            },
            timestamp: Date.now(),
            modelVersion: this.metadata?.version || '1.0.0'
        };
    }

    protected mapPredictionToVulnerability(prediction: number[]): VulnerabilityType {
        const maxIndex = prediction.indexOf(Math.max(...prediction));
        switch (maxIndex) {
            case 0:
                return VulnerabilityType.ArithmeticOverflow;
            case 1:
                return VulnerabilityType.AccessControl;
            case 2:
                return VulnerabilityType.Reentrancy;
            case 3:
                return VulnerabilityType.PDASafety;
            case 4:
                return VulnerabilityType.CPISafety;
            default:
                return VulnerabilityType.None;
        }
    }

    async save(path: string): Promise<void> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }
        await this.model.save(`file://${path}`);
        // Save metadata separately
        await fs.promises.writeFile(
            `${path}_metadata.json`,
            JSON.stringify(this.metadata)
        );
    }

    async load(path: string): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(`file://${path}`) as tf.Sequential;
            // Load metadata
            const metadataStr = await fs.promises.readFile(
                `${path}_metadata.json`,
                'utf8'
            );
            this.metadata = JSON.parse(metadataStr);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            throw new Error(`Failed to load model: ${error.message}`);
        }
    }

    dispose(): void {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
    }
} 