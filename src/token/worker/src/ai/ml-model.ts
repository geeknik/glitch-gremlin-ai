import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityType, Finding } from '../types';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../utils/logger';

export interface ModelOutput {
    vulnerabilityType: VulnerabilityType;
    confidence: number;
    details?: string[];
}
export class VulnerabilityDetectionModel {
    private model: tf.LayersModel;
    
    constructor() {
        this.model = this.buildModel();
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential();
        
        // Input layer for processing transaction patterns
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [10] // Features like tx count, error rate, latency etc
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        // Output layer for vulnerability classification
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
            type: vulnerabilityTypes[maxIndex] as VulnerabilityType,
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
        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        this.model = await tf.loadLayersModel(`file://${path}`);
    }
}
