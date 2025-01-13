import * as tf from '@tensorflow/tfjs-node';

export interface ModelOutput {
    prediction: number[];
    confidence: number;
}

export interface VulnerabilityOutput extends ModelOutput {
    type: string;
    confidence: number;
}

export class VulnerabilityDetectionModel extends MLModel {
    constructor() {
        super();
    }
    
    async predict(features: number[]): Promise<VulnerabilityOutput> {
        const baseOutput = await super.predict(features);
        const vulnerabilityIndex = baseOutput.prediction.indexOf(Math.max(...baseOutput.prediction));
        
        return {
            prediction: baseOutput.prediction,
            type: this.mapIndexToVulnerabilityType(vulnerabilityIndex),
            confidence: baseOutput.confidence
        };
    }
    
    private mapIndexToVulnerabilityType(index: number): VulnerabilityType {
        const types = Object.values(VulnerabilityType);
        return types[index] || VulnerabilityType.Unknown;
    }
}

export class MLModel {
    protected model: tf.LayersModel;
    protected isInitialized: boolean = false;

    constructor() {
        this.model = this.buildModel();
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ units: 64, activation: 'relu', inputShape: [20] }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 32, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 16, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    async train(features: number[][], labels: number[]): Promise<void> {
        if (!features || !labels || features.length !== labels.length) {
            throw new Error('Invalid training data');
        }

        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels, [labels.length, 1]);

        try {
            await this.model.fit(xs, ys, {
                epochs: 50,
                batchSize: 32,
                validationSplit: 0.2,
                shuffle: true
            });

            this.isInitialized = true;
        } finally {
            xs.dispose();
            ys.dispose();
        }
    }

    async predict(features: number[]): Promise<ModelOutput> {
        if (!features || features.length !== 20) {
            throw new Error('Invalid input: expected 20 features');
        }

        if (!this.isInitialized) {
            throw new Error('Model not trained');
        }

        const input = tf.tensor2d([features]);
        try {
            const prediction = await this.model.predict(input) as tf.Tensor;
            const values = await prediction.data();
            const confidence = values[0];

            return {
                prediction: Array.from(values),
                confidence
            };
        } finally {
            input.dispose();
        }
    }

    async save(path: string): Promise<void> {
        if (!path) {
            throw new Error('Invalid save path specified');
        }

        if (!this.isInitialized) {
            throw new Error('Model not trained');
        }

        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        if (!path) {
            throw new Error('Invalid load path specified');
        }

        try {
            this.model = await tf.loadLayersModel(`file://${path}/model.json`);
            this.isInitialized = true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to load model: ${errorMessage}`);
        }
    }

    async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
        }
        this.isInitialized = false;
    }

    private analyzePrediction(features: number[], confidence: number): string {
        const analysis = [];

        if (confidence > 0.8) {
            analysis.push('High confidence prediction');
        } else if (confidence > 0.5) {
            analysis.push('Moderate confidence prediction');
        } else {
            analysis.push('Low confidence prediction');
        }

        return analysis.join('\n');
    }
}
