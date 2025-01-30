import * as tf from '@tensorflow/tfjs-node';
import { FuzzingState, FuzzingAction } from '@/types.js';

export interface FuzzingExperience {
    state: FuzzingState;
    action: FuzzingAction;
    reward: number;
    nextState: FuzzingState;
    done: boolean;
    priority?: number;
}

export interface RLFuzzingConfig {
    stateSize: number;
    actionSize: number;
    batchSize?: number;
    gamma?: number;
    epsilonMin?: number;
    epsilonDecay?: number;
    targetUpdateFrequency?: number;
    maxConcurrentFuzzing: number;
    priorityAlpha?: number;  // Priority exponent
    priorityBeta?: number;   // Importance sampling weight
    maxMemorySize?: number;  // Maximum size of replay buffer
}

interface PrioritizedExperience extends FuzzingExperience {
    priority: number;
    index: number;
}

export class ReinforcementFuzzing {
    private model: tf.Sequential;
    private targetModel: tf.Sequential;
    private readonly stateSize: number;
    private readonly actionSize: number;
    private readonly batchSize: number;
    private readonly gamma: number;
    private epsilon: number;
    private readonly epsilonMin: number;
    private readonly epsilonDecay: number;
    private readonly priorityAlpha: number;
    private readonly priorityBeta: number;
    private readonly maxMemorySize: number;
    private memory: PrioritizedExperience[];
    private memoryIndex: number;

    constructor(
        stateSize: number,
        actionSize: number,
        batchSize: number = 32,
        gamma: number = 0.95,
        epsilon: number = 1.0,
        epsilonMin: number = 0.01,
        epsilonDecay: number = 0.995,
        priorityAlpha: number = 0.6,
        priorityBeta: number = 0.4,
        maxMemorySize: number = 10000
    ) {
        this.stateSize = stateSize;
        this.actionSize = actionSize;
        this.batchSize = batchSize;
        this.gamma = gamma;
        this.epsilon = epsilon;
        this.epsilonMin = epsilonMin;
        this.epsilonDecay = epsilonDecay;
        this.priorityAlpha = priorityAlpha;
        this.priorityBeta = priorityBeta;
        this.maxMemorySize = maxMemorySize;
        this.memory = [];
        this.memoryIndex = 0;
        this.model = this.buildModel();
        this.targetModel = this.buildModel();
        this.targetModel.setWeights(this.model.getWeights());
    }

    private buildModel(): tf.Sequential {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [this.stateSize]
        }));

        // Hidden layers with dropout for regularization
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu'
        }));
        model.add(tf.layers.dropout({ rate: 0.2 }));

        // Additional hidden layer
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu'
        }));
        model.add(tf.layers.dropout({ rate: 0.2 }));

        // Output layer for action values
        model.add(tf.layers.dense({
            units: this.actionSize,
            activation: 'linear'
        }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'huberLoss'  // More robust to outliers than MSE
        });

        return model;
    }

    private stateToTensor(state: FuzzingState): tf.Tensor {
        // Enhanced state representation
        const stateArray = [
            state.metrics.coverage,
            state.metrics.uniquePaths,
            state.metrics.vulnerabilitiesFound,
            state.metrics.successRate,
            state.metrics.avgExecutionTime,
            state.programState.slot,
            state.programState.blockTime,
            ...state.programState.accounts.flatMap(account => [
                Number(account.lamports),
                account.executable ? 1 : 0,
                // Add account type encoding
                account.owner === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ? 1 : 0,
                account.owner === '11111111111111111111111111111111' ? 1 : 0
            ]),
            // Add historical metrics
            state.history.actions.length,
            state.history.rewards.reduce((sum, r) => sum + r, 0) / Math.max(1, state.history.rewards.length),
            // Add security metrics
            state.metrics.coverage * 100,  // Normalize to percentage
            state.metrics.successRate * 100,  // Normalize to percentage
            state.metrics.vulnerabilitiesFound * 10,  // Scale for better gradient flow
            Math.log(Math.max(1, state.metrics.avgExecutionTime))  // Log scale for execution time
        ];
        return tf.tensor(stateArray, [1, stateArray.length]);
    }

    public remember(
        state: FuzzingState,
        action: FuzzingAction,
        reward: number,
        nextState: FuzzingState,
        done: boolean
    ): void {
        const experience: PrioritizedExperience = {
            state,
            action,
            reward,
            nextState,
            done,
            priority: 1.0,  // New experiences get max priority
            index: this.memoryIndex
        };

        if (this.memory.length < this.maxMemorySize) {
            this.memory.push(experience);
        } else {
            // Replace old experiences using circular buffer
            this.memory[this.memoryIndex % this.maxMemorySize] = experience;
        }
        this.memoryIndex++;
    }

    private sampleBatch(): {
        batch: PrioritizedExperience[];
        importanceWeights: number[];
        indices: number[];
    } {
        const priorities = this.memory.map(exp => Math.pow(exp.priority, this.priorityAlpha));
        const totalPriority = priorities.reduce((a, b) => a + b, 0);
        const probabilities = priorities.map(p => p / totalPriority);

        const batch: PrioritizedExperience[] = [];
        const indices: number[] = [];
        const importanceWeights: number[] = [];

        for (let i = 0; i < Math.min(this.batchSize, this.memory.length); i++) {
            const rand = Math.random();
            let cumSum = 0;
            let index = 0;
            
            for (let j = 0; j < probabilities.length; j++) {
                cumSum += probabilities[j];
                if (rand < cumSum) {
                    index = j;
                    break;
                }
            }

            batch.push(this.memory[index]);
            indices.push(index);
            
            // Calculate importance sampling weights
            const weight = Math.pow(1 / (this.memory.length * probabilities[index]), this.priorityBeta);
            importanceWeights.push(weight);
        }

        // Normalize weights
        const maxWeight = Math.max(...importanceWeights);
        const normalizedWeights = importanceWeights.map(w => w / maxWeight);

        return { batch, importanceWeights: normalizedWeights, indices };
    }

    public async train(): Promise<number> {
        if (this.memory.length < this.batchSize) {
            return 0;
        }

        const { batch, importanceWeights, indices } = this.sampleBatch();
        const states = tf.concat(batch.map(exp => this.stateToTensor(exp.state)));
        const nextStates = tf.concat(batch.map(exp => this.stateToTensor(exp.nextState)));

        try {
            const targetQValues = this.targetModel.predict(nextStates) as tf.Tensor;
            const currentQValues = this.model.predict(states) as tf.Tensor;

            const qTargets = await currentQValues.array() as number[][];
            const nextQValues = await targetQValues.array() as number[][];

            for (let i = 0; i < batch.length; i++) {
                const experience = batch[i];
                const actionIndex = this.getActionIndex(experience.action);
                
                if (experience.done) {
                    qTargets[i][actionIndex] = experience.reward;
                } else {
                    const futureQ = Math.max(...nextQValues[i]);
                    qTargets[i][actionIndex] = experience.reward + this.gamma * futureQ;
                }

                // Update priorities based on TD error
                const tdError = Math.abs(qTargets[i][actionIndex] - currentQValues.arraySync()[i][actionIndex]);
                this.memory[indices[i]].priority = tdError;
            }

            // Apply importance weights to loss
            const weightsTensor = tf.tensor2d([importanceWeights], [1, importanceWeights.length]);
            
            const history = await this.model.fit(states, tf.tensor2d(qTargets), {
                batchSize: this.batchSize,
                epochs: 1,
                verbose: 0,
                sampleWeight: weightsTensor
            });

            return history.history.loss[0] as number;
        } finally {
            tf.dispose([states, nextStates]);
        }
    }

    public act(state: FuzzingState): number {
        // Epsilon-greedy with decay
        if (Math.random() <= this.epsilon) {
            return Math.floor(Math.random() * this.actionSize);
        }

        const stateTensor = this.stateToTensor(state);
        try {
            const actionValues = this.model.predict(stateTensor) as tf.Tensor;
            return Number(actionValues.reshape([this.actionSize]).argMax().dataSync()[0]);
        } finally {
            tf.dispose([stateTensor]);
        }
    }

    public updateEpsilon(): void {
        this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    }

    private getActionIndex(action: FuzzingAction): number {
        switch (action.type) {
            case 'MUTATE':
                return 0;
            case 'CROSSOVER':
                return 1;
            case 'RESET':
                return 2;
            case 'EXPLOIT':
                return 3;
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    public dispose(): void {
        this.model.dispose();
        this.targetModel.dispose();
    }
}

