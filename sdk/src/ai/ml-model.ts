import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityType } from '../types';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class VulnerabilityDetectionModel {
    private initialized: boolean = false;
    private model: tf.LayersModel;
    
    constructor() {
        this.model = this.buildModel();
    }

    public async ensureInitialized() {
        if (!this.initialized) {
            await tf.ready();
            await tf.setBackend('cpu');
            this.model = this.buildModel();
            this.initialized = true;
        }
    }

    public async cleanup() {
        tf.dispose();
        this.initialized = false;
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential();
        
        // Enhanced model architecture for vulnerability detection
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [20] // Expanded feature set
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dense({
            units: Object.keys(VulnerabilityType).length,
            activation: 'softmax'
        }));

        model.compile({
            optimizer: tf.train.adam(),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    async train(data: Array<{
        features: number[];
        vulnerabilityType: VulnerabilityType;
    }>): Promise<void> {
        const xs = tf.tensor2d(data.map(d => d.features));
        const ys = tf.tensor2d(data.map(d => this.oneHotEncode(d.vulnerabilityType)));

        await this.model.fit(xs, ys, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch: number, logs?: tf.Logs) => {
                    if (logs?.loss) {
                        console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}`);
                    }
                }
            }
        });

        xs.dispose();
        ys.dispose();
    }

    async predict(features: number[]): Promise<{
        type: VulnerabilityType;
        confidence: number;
        details?: string;
    }> {
        await this.ensureInitialized();
        
        const input = tf.tensor2d([features]);
        const prediction = this.model.predict(input) as tf.Tensor;
        const probabilities = await prediction.array() as number[][];
        
        input.dispose();
        prediction.dispose();

        const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
        const vulnerabilityTypes = Object.values(VulnerabilityType);
        const confidence = probabilities[0][maxIndex];

        // Enhanced prediction logic with detailed analysis
        const details = this.analyzePrediction(features, confidence);

        return {
            type: vulnerabilityTypes[maxIndex],
            confidence,
            details
        };
    }

    private analyzePrediction(features: number[], confidence: number): string {
        const patterns = [];
        
        // Analyze feature patterns
        if (features[0] > 0.8) patterns.push('High transaction volume');
        if (features[1] > 0.7) patterns.push('Unusual error rate');
        if (features[2] > 0.9) patterns.push('Memory access pattern anomaly');
        
        return patterns.length > 0 
            ? `Detected patterns: ${patterns.join(', ')}` 
            : 'No specific patterns detected';
    }

    private oneHotEncode(type: VulnerabilityType): number[] {
        const vulnerabilityTypes = Object.values(VulnerabilityType);
        const encoded = new Array(vulnerabilityTypes.length).fill(0);
        encoded[vulnerabilityTypes.indexOf(type)] = 1;
        return encoded;
    }

    async save(path: string): Promise<void> {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(`file://${path}/model.json`);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to load model: ${error.message}`);
            }
            throw error;
        }
    }
}
