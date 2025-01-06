import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityType } from '../types';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class VulnerabilityDetectionModel {
    private initialized: boolean = false;
    private model: tf.LayersModel;
    
    constructor() {
        this.model = this.buildModel();
        this.initializeModel();
    }

    private async initializeModel() {
        if (!this.initialized) {
            await tf.ready();
            await tf.setBackend('cpu');
            this.model = this.buildModel();
            this.initialized = true;
        }
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential();
        
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [10]
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
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch}: loss = ${logs?.loss.toFixed(4)}`);
                }
            }
        });

        xs.dispose();
        ys.dispose();
    }

    async predict(features: number[]): Promise<{
        type: VulnerabilityType;
        confidence: number;
    }> {
        const input = tf.tensor2d([features]);
        const prediction = this.model.predict(input) as tf.Tensor;
        const probabilities = await prediction.array() as number[][];
        
        input.dispose();
        prediction.dispose();

        const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
        const vulnerabilityTypes = Object.values(VulnerabilityType);

        return {
            type: vulnerabilityTypes[maxIndex],
            confidence: probabilities[0][maxIndex]
        };
    }

    private oneHotEncode(type: VulnerabilityType): number[] {
        const vulnerabilityTypes = Object.values(VulnerabilityType);
        const encoded = new Array(vulnerabilityTypes.length).fill(0);
        encoded[vulnerabilityTypes.indexOf(type)] = 1;
        return encoded;
    }

    async save(path: string): Promise<void> {
        if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
        }
        const modelPath = join(path, 'model.json');
        await this.model.save(`file://${modelPath}`);
    }

    async load(path: string): Promise<void> {
        const modelPath = join(path, 'model.json');
        this.model = await tf.loadLayersModel(`file://${modelPath}`);
    }
}
