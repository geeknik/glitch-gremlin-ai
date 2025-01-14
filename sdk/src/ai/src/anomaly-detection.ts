import '@tensorflow/tfjs-node';
import * as tf from '@tensorflow/tfjs';
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

        try {
            // Convert buffer to float32 array
            const values = new Float32Array(input);

            // Create tensor with proper shape
            const tensor = tf.tensor(values, [1, values.length]);

            // Normalize data
            const normalized = await this.normalizeData(tensor);

            // Make prediction
            const prediction = this.model.predict(normalized) as tf.Tensor;
            const score = prediction.dataSync()[0];

            return score;
        } catch (error) {
            this.logger.error(`Prediction failed: ${error}`);
            throw error;
        }
    }
    private model: tf.LayersModel | null = null;
    private logger: Logger;
    private initialized: boolean = false;
    private readonly inputWindowSize = 50;
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

        // Check memory status before initialization
        const memoryInfo = tf.memory();
        this.logger.info(`Memory before init: numTensors=${memoryInfo.numTensors}, numDataBuffers=${memoryInfo.numDataBuffers}`);

        if (memoryInfo.numTensors > 1000) {
            this.logger.warn('High number of tensors detected, running garbage collection');
            tf.dispose();
        }

        try {
            await tf.ready();
            this.logger.info('Starting model building...');
            this.model = this.buildModel();
            this.logger.info('Model building completed successfully.');
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
                units: 16, // Reduced units for test environment
                returnSequences: true
            }),
            inputShape: [this.inputWindowSize, this.featureSize]
        }));

        model.add(tf.layers.dense({
            units: 32,
            activation: 'tanh',
            kernelInitializer: 'glorotUniform' // Use simpler initializer for test environment
        }));

        model.add(tf.layers.lstm({
            units: 8, // Reduced units for test environment
            returnSequences: false
        }));

        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'glorotUniform' // Use simpler initializer for test environment
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

    private async normalizeData(data: tf.Tensor): Promise<tf.Tensor> {
        try {
            this.logger.info(`Memory before normalization: ${JSON.stringify(tf.memory())}`);
            return tf.tidy(() => {
                // Ensure we have valid stats for normalization
                if (!this.normalizedStats.mean || !this.normalizedStats.std) {
                    const moments = tf.moments(data, 0);
                    this.normalizedStats.mean = moments.mean;
                    this.normalizedStats.std = moments.variance.sqrt();
                    // Dispose variance tensor after sqrt
                    moments.variance.dispose();
                }

                // Add small epsilon to avoid division by zero
                const epsilon = tf.scalar(1e-8);

                // Validate tensor shape
                if (!data || !data.shape || data.shape.length < 1) {
                    throw new Error('Invalid tensor shape for normalization');
                }

                // Normalize the data with error checking
                // Ensure tensors are valid before operations
                if (!this.normalizedStats.mean || !this.normalizedStats.std) {
                    throw new Error('Normalization stats not initialized');
                }

                // Normalize the data with error checking
                const normalizedData = tf.tidy(() => {
                    const centered = data.sub(this.normalizedStats.mean!);
                    const scaleFactor = this.normalizedStats.std!.add(epsilon);
                    return centered.div(scaleFactor);
                });
                return normalizedData;
            });
        } catch (error) {
            this.logger.error(`Normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    private createWindows(data: TimeSeriesMetrics[]): tf.Tensor3D {
        const windows: number[][][] = [];

        for (let i = 0; i <= data.length - this.inputWindowSize; i++) {
            const window: number[][] = [];

            for (let j = 0; j < this.inputWindowSize; j++) {
                const metrics = data[i + j];
                window.push([
                    metrics.instructionFrequency[0] || 0, // Provide default value if undefined
                    metrics.memoryAccess[0] || 0, // Provide default value if undefined
                    metrics.accountAccess[0] || 0, // Provide default value if undefined
                    metrics.stateChanges[0] || 0 // Provide default value if undefined
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
                this.logger.info('Starting window creation...');
                const windows = this.createWindows(data);
                this.logger.info('Window creation completed successfully.');

                this.logger.info('Starting normalization...');
                const normalizedWindows = await this.normalizeData(windows);
                this.logger.info('Normalization completed successfully.');

                const xs = normalizedWindows; // Removed incorrect slice operation

                const ys = normalizedWindows.slice([0, 1, 0], [-1, 1, -1]); // Predict next timestep

                this.logger.info('Starting model fitting...');
                await this.model!.fit(xs, ys, {
                    epochs: 10,
                    batchSize: 32,
                    callbacks: {
                        onEpochEnd: (epoch, logs) => {
                            this.emit('epochEnd', { epoch, logs });
                        }
                    }
                });
                this.logger.info('Model fitting completed successfully.');

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
        // Start scope for tensor management
        tf.engine().startScope();

        try {
            if (!this.model) {
                throw new Error('Model not trained');
            }
            if (data.length < this.inputWindowSize) {
                throw new Error(`Insufficient data points. Minimum required: ${this.inputWindowSize}`);
            }

            // Validate input data
            if (!data || !Array.isArray(data)) {
                throw new Error('Invalid input data');
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

            this.logger.info('Starting window creation...');
            const windows = this.createWindows(data);
            this.logger.info('Window creation completed successfully.');

            this.logger.info('Starting normalization...');
            const normalizedWindows = await this.normalizeData(windows);
            this.logger.info('Normalization completed successfully.');

            try {
                // Wrap tensor operations in tf.tidy for automatic cleanup
                this.logger.info('Starting prediction...');
                const [predictions, scores, results] = tf.tidy(() => {
                    const predictions = this.model!.predict(normalizedWindows) as tf.Tensor;
                    if (!predictions || !predictions.shape || predictions.shape.length < 1) {
                        throw new Error('Invalid prediction tensor');
                    }

                    const anomalyScores = predictions.sub(normalizedWindows).abs().mean(2);
                    const isAnomaly = anomalyScores.greater(tf.scalar(0.5));
                    const confidence = anomalyScores.sigmoid();

                    return [predictions, anomalyScores, { isAnomaly, confidence }];
                });
                this.logger.info('Prediction completed successfully.');

                const details = this.extractDetails(scores, normalizedWindows);

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
                // End tensor scope
                tf.engine().endScope();
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
