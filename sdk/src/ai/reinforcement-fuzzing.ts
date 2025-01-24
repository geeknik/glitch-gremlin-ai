import tf from '@tensorflow/tfjs-node';
import { FuzzingState } from './types.js';

interface RLConfig {
    stateSize: number;
    actionSize: number;
    batchSize: number;
    memorySize: number;
    gamma: number;
    learningRate: number;
    epsilonDecay?: number;
    minEpsilon?: number;
    targetUpdateFreq?: number;
}

interface Experience {
    state: FuzzingState;
    action: number;
    reward: number;
    nextState: FuzzingState;
    done: boolean;
}

export class RLFuzzingModel {
    private mainNetwork: tf.Sequential | null = null;
    private targetNetwork: tf.Sequential | null = null;
    public memory: Experience[] = [];
    public epsilon: number = 1.0;
    private stepCount: number = 0;
    private initialized: boolean = false;

    readonly stateSize: number;
    readonly actionSize: number;
    readonly batchSize: number;
    readonly memorySize: number;
    readonly gamma: number;
    readonly learningRate: number;
    readonly epsilonDecay: number;
    readonly minEpsilon: number;
    readonly targetUpdateFreq: number;

    constructor(config: RLConfig) {
        this.validateConfig(config);

        this.stateSize = config.stateSize;
        this.actionSize = config.actionSize;
        this.batchSize = config.batchSize;
        this.memorySize = config.memorySize;
        this.gamma = config.gamma;
        this.learningRate = config.learningRate;
        this.epsilonDecay = config.epsilonDecay ?? 0.995;
        this.minEpsilon = config.minEpsilon ?? 0.01;
        this.targetUpdateFreq = config.targetUpdateFreq ?? 100;

        this.mainNetwork = null;
        this.targetNetwork = null;
        this.initialized = false;
        this.initializeNetworks();
    }

    private validateConfig(config: RLConfig) {
        if (config.stateSize <= 0) throw new Error('Invalid state size');
        if (config.actionSize <= 0) throw new Error('Invalid action size');
        if (config.batchSize <= 0) throw new Error('Invalid batch size');
        if (config.memorySize <= 0) throw new Error('Invalid memory size');
        if (config.gamma <= 0 || config.gamma >= 1) throw new Error('Invalid gamma value');
        if (config.learningRate <= 0) throw new Error('Invalid learning rate');
    }

    private initializeNetworks() {
        try {
            console.log('Initializing main network...');
            this.mainNetwork = tf.sequential();
            if (!this.mainNetwork) {
                throw new Error('mainNetwork is undefined after tf.sequential()');
            }

            console.log('Initializing target network...');
            this.targetNetwork = tf.sequential();
            if (!this.targetNetwork) {
                throw new Error('targetNetwork is undefined after tf.sequential()');
            }
            
            // Configure networks
            this.configureNetwork(this.mainNetwork);
            this.configureNetwork(this.targetNetwork);
            
            // Copy weights from main to target network
            this.targetNetwork.setWeights(this.mainNetwork.getWeights());
            this.initialized = true;
            console.log('Networks initialized successfully');
        } catch (error) {
            console.error('Network initialization error:', error);
            this.mainNetwork = null;
            this.targetNetwork = null;
            this.initialized = false;
            throw new Error(`Failed to initialize networks: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private configureNetwork(network: tf.Sequential): void {
        try {
            console.log('Adding input layer...');
            network.add(tf.layers.dense({
                units: 64,
                activation: 'relu',
                inputShape: [this.stateSize]
            }));
            console.log('Input layer added');

            console.log('Adding hidden layer...');
            network.add(tf.layers.dense({
                units: 32,
                activation: 'relu'
            }));
            console.log('Hidden layer added');

            console.log('Adding output layer...');
            network.add(tf.layers.dense({
                units: this.actionSize,
                activation: 'linear'
            }));
            console.log('Output layer added');

            console.log('Compiling network...');
            const optimizer = tf.train.adam(this.learningRate);
            network.compile({
                optimizer,
                loss: 'meanSquaredError'
            });
            console.log('Network compiled successfully');
        } catch (error) {
            console.error('Error configuring network:', error);
            throw error;
        }
    }

    private stateToTensor(state: FuzzingState): tf.Tensor2D {
        const features = [
            state.programCounter,
            ...state.coverage,
            state.lastCrash ? 1 : 0,
            state.mutationHistory.length,
            state.executionTime
        ];
        return tf.tensor2d([features]);
    }

    async selectAction(state: FuzzingState): Promise<number> {
        if (!this.mainNetwork || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.actionSize);
        }

        const stateTensor = this.stateToTensor(state);
        try {
            const qValues = this.mainNetwork.predict(stateTensor) as tf.Tensor;
            const action = tf.argMax(qValues, 1).dataSync()[0];
            return action;
        } finally {
            tf.dispose(stateTensor);
        }
    }

    remember(state: FuzzingState, action: number, reward: number, nextState: FuzzingState, done: boolean) {
        this.memory.push({ state, action, reward, nextState, done });
        if (this.memory.length > this.memorySize) {
            this.memory.shift();
        }
    }

    async train(): Promise<void> {
        if (!this.mainNetwork || !this.targetNetwork || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (this.memory.length < this.batchSize) return;

        const batch = this.sampleBatch();
        const states = tf.concat(batch.map(exp => this.stateToTensor(exp.state)));
        const nextStates = tf.concat(batch.map(exp => this.stateToTensor(exp.nextState)));

        try {
            const targetQValues = this.targetNetwork.predict(nextStates) as tf.Tensor;
            const currentQValues = this.mainNetwork.predict(states) as tf.Tensor;

            const qTargets = await currentQValues.array() as number[][];
            const nextQValues = await targetQValues.array() as number[][];

            batch.forEach((exp, i) => {
                const nextQ = exp.done ? 0 : Math.max(...nextQValues[i]);
                qTargets[i][exp.action] = exp.reward + this.gamma * nextQ;
            });

            await this.mainNetwork.fit(states, tf.tensor(qTargets), {
                epochs: 1,
                verbose: 0
            });

            this.stepCount++;
            if (this.stepCount % this.targetUpdateFreq === 0) {
                this.targetNetwork.setWeights(this.mainNetwork.getWeights());
            }

            this.epsilon = Math.max(
                this.minEpsilon,
                this.epsilon * this.epsilonDecay
            );

            tf.dispose([targetQValues, currentQValues]);
        } finally {
            tf.dispose([states, nextStates]);
        }
    }

    private sampleBatch(): Experience[] {
        const batch: Experience[] = [];
        for (let i = 0; i < this.batchSize; i++) {
            const index = Math.floor(Math.random() * this.memory.length);
            batch.push(this.memory[index]);
        }
        return batch;
    }

    async saveModel(path: string): Promise<void> {
        if (!this.mainNetwork || !this.initialized) {
            throw new Error('Model not initialized');
        }
        await this.mainNetwork.save(`file://${path}`);
    }

    async loadModel(path: string): Promise<void> {
        try {
            this.mainNetwork = await tf.loadLayersModel(`file://${path}/model.json`) as tf.Sequential;
            this.mainNetwork.compile({
                optimizer: tf.train.adam(this.learningRate),
                loss: 'meanSquaredError'
            });
            this.targetNetwork?.setWeights(this.mainNetwork.getWeights());
            this.initialized = true;
        } catch (error: unknown) {
            throw new Error(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    dispose(): void {
        if (this.mainNetwork) {
            this.mainNetwork.dispose();
            this.mainNetwork = null;
        }
        if (this.targetNetwork) {
            this.targetNetwork.dispose();
            this.targetNetwork = null;
        }
        this.initialized = false;
    }
}
