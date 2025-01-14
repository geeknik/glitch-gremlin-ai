import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';

export interface TimeSeriesMetrics {
    instructionFrequency: number[];
    memoryAccess: number[];
    accountAccess: number[];
    stateChanges: number[];
    timestamp: number;
}

export interface AnomalyDetectionResult {
    isAnomaly: boolean;
    confidence: number;
    details: {
        category: string;
        score: number;
        threshold: number;
    }[];
}

const logger = new Logger('anomaly-detection');
export { logger };

export class AnomalyDetectionModel extends EventEmitter {
    async predict(input: Buffer): Promise<number> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }
        
        const tensor = tf.tensor([Array.from(input)]);
        const normalized = this.normalizeData(tensor);
        const prediction = this.model.predict(normalized) as tf.Tensor;
        const score = prediction.dataSync()[0];
        
        tf.dispose([tensor, normalized, prediction]);
        return score;
    }
    private model: tf.LayersModel | null = null;
    private logger: Logger;
    private initialized: boolean = false;
    private readonly inputWindowSize = 100;
    private readonly outputWindowSize = 1;
    private readonly featureSize = 4;
    private normalizedStats: {
        mean?: tf.Tensor1D;
        std?: tf.Tensor1D;
    } = {};

    constructor() {
        super();
        this.logger = logger;
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            await this.cleanup();
            this.initialized = false;
        }

        try {
            await tf.ready();
            this.model = this.buildModel();
            this.initialized = true;
            this.logger.info('Model initialized successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Initialization failed: ${errorMessage}`);
            throw error;
        }
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential();

        model.add(tf.layers.inputLayer({
            inputShape: [this.inputWindowSize, this.featureSize]
        }));

        model.add(tf.layers.bidirectional({
            layer: tf.layers.lstm({
                units: 64,
                returnSequences: true
            }),
            inputShape: [this.inputWindowSize, this.featureSize]
        }));

        model.add(tf.layers.dense({
            units: 32,
            activation: 'tanh'
        }));

        model.add(tf.layers.lstm({
            units: 32,
            returnSequences: false
        }));

        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu'
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        model.add(tf.layers.dense({
            units: this.outputWindowSize, // Corrected output shape
            activation: 'linear'
        }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['accuracy']
        });

        return model;
    }

    private async normalizeData(data: tf.Tensor3D): Promise<tf.Tensor3D> {
        return tf.tidy(() => {
            const reshapedData = data.reshape([
                data.shape[0] * data.shape[1],
                data.shape[2]
            ]);

            if (!this.normalizedStats.mean || !this.normalizedStats.std) {
                const moments = tf.moments(reshapedData, 0);
                this.normalizedStats.mean = moments.mean as tf.Tensor1D;
                this.normalizedStats.std = moments.variance.sqrt() as tf.Tensor1D;
                moments.dispose();
            }

            const normalizedData = reshapedData
                .sub(this.normalizedStats.mean)
                .div(this.normalizedStats.std.add(tf.scalar(1e-8)));

            return normalizedData.reshape([
                data.shape[0],
                data.shape[1],
                data.shape[2]
            ]) as tf.Tensor3D;
        });
    }

    private createWindows(data: TimeSeriesMetrics[]): tf.Tensor3D {
        const windows: number[][][] = [];

        for (let i = 0; i <= data.length - this.inputWindowSize; i++) {
            const window: number[][] = [];

            for (let j = 0; j < this.inputWindowSize; j++) {
                const metrics = data[i + j];
                window.push([
                    metrics.instructionFrequency[0],
                    metrics.memoryAccess[0],
                    metrics.accountAccess[0],
                    metrics.stateChanges[0]
                ]);
            }

            windows.push(window);
        }

        return tf.tensor3d(windows);
    }

    public async train(data: TimeSeriesMetrics[]): Promise<void> {
        if (!data) {
            throw new Error('Training data cannot be null/undefined');
        }

        if (data.length < this.inputWindowSize) {
            throw new Error(`Insufficient data points. Minimum required: ${this.inputWindowSize}`);
        }

        try {
            return tf.tidy(async () => {
                const windows = this.createWindows(data);
                const normalizedWindows = await this.normalizeData(windows);

                const xs = normalizedWindows; // Removed incorrect slice operation

                const ys = normalizedWindows.slice([0, 1, 0], [-1, 1, -1]); // Predict next timestep

                await this.model!.fit(xs, ys, {
                    epochs: 10,
                    batchSize: 32,
                    callbacks: {
                        onEpochEnd: (epoch, logs) => {
                            this.emit('epochEnd', { epoch, logs });
                        }
                    }
                });

                this.logger.info('Model trained successfully');
                xs.dispose();
                ys.dispose();
                normalizedWindows.dispose();
                windows.dispose();
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Training failed: ${errorMessage}`);
            throw new Error(`Training failed: ${errorMessage}`);
        }
    }


    public async detect(data: TimeSeriesMetrics[]): Promise<AnomalyDetectionResult> {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        if (data.length < this.inputWindowSize) {
            throw new Error(`Insufficient data points. Minimum required: ${this.inputWindowSize}`);
        }

        try {
            // Check heap before processing
            if (global.gc) {
                try {
                    await global.gc();
                } catch (error) {
                    if (error instanceof Error && error.message.includes('Heap limit')) {
                        this.logger.error('Heap limit reached');
                        throw new Error('Heap limit reached');
                    }
                    throw error;
                }
            }

            // Create tensors outside tidy to manage their lifecycle
            const windows = this.createWindows(data);
            const normalizedWindows = await this.normalizeData(windows);
            
            try {
                const predictions = this.model.predict(normalizedWindows) as tf.Tensor;
                const anomalyScores = predictions.sub(normalizedWindows).abs().mean(2);
                const isAnomaly = anomalyScores.greater(tf.scalar(0.5));
                const confidence = anomalyScores.sigmoid();
                const details = this.extractDetails(anomalyScores, normalizedWindows);

                const result = {
                    isAnomaly: isAnomaly.dataSync()[0] > 0,
                    confidence: confidence.dataSync()[0],
                    details
                };

                // Clean up tensors
                tf.dispose([predictions, anomalyScores, isAnomaly, confidence]);
                return result;
            } finally {
                // Ensure cleanup of input tensors
                tf.dispose([windows, normalizedWindows]);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Detection failed: ${errorMessage}`);
            throw error;
        }
    }

    private extractDetails(anomalyScores: tf.Tensor1D, normalizedWindows: tf.Tensor3D): { category: string; score: number; threshold: number; }[] {
        const details: { category: string; score: number; threshold: number; }[] = [];
        const scores = anomalyScores.dataSync();
        const threshold = 0.5;

        for (let i = 0; i < scores.length; i++) {
            details.push({
                category: `Metric ${i + 1}`,
                score: scores[i],
                threshold
            });
        }

        return details;
    }

    public async save(path: string): Promise<void> {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        await this.model.save(`file://${path}/model.json`);
        this.logger.info(`Model saved to ${path}`);
    }

    public async load(path: string): Promise<void> {
        if (this.model) {
            this.model.dispose();
        }
        this.model = await tf.loadLayersModel(`file://${path}/model.json`);
        this.logger.info(`Model loaded from ${path}`);
    }

    public async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
            this.model = null;
            this.logger.info('Model disposed');
        }
    }
}
