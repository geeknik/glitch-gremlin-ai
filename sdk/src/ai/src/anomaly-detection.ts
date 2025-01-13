import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';
import { Logger } from '@/utils/logger';

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

export class AnomalyDetectionModel extends EventEmitter implements AnomalyDetectionModel {
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
        this.logger = new Logger('AnomalyDetection');
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            throw new Error('Model is already initialized');
        }

        try {
            this.model = this.buildModel();
            this.initialized = true;
            this.logger.info('Model initialized successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Initialization failed: ${errorMessage}`);
            throw new Error(`Initialization failed: ${errorMessage}`);
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
            units: this.featureSize,
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
                this.normalizedStats.mean = tf.mean(reshapedData, 0) as tf.Tensor1D;
                this.normalizedStats.std = moments.variance.sqrt() as tf.Tensor1D;
                moments.mean.dispose();
                moments.variance.dispose();
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

                const xs = normalizedWindows.slice([0, 0, 0], [
                    -1,
                    this.inputWindowSize,