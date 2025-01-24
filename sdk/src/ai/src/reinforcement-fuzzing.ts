import * as tf from '@tensorflow/tfjs-node';

class ModelBuildError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ModelBuildError';
    }
}
import { SmartMutationOperator } from './reinforcement-fuzzing-utils.js';

/**
* Interface defining the state representation for the RL agent
*/
export interface FuzzingState {
    programCounter: number;
    coverage: number;
    lastCrash: number;
    mutationHistory: string[];
    executionTime: number;
}

/**
* Interface defining the result of taking an action
*/
interface ActionResult {
    nextState: FuzzingState;
    reward: number;
    done: boolean;
}

/**
* Reinforcement Learning based fuzzing model using Deep Q-Network (DQN)
*/
export class ReinforcementFuzzer {
    private model!: tf.LayersModel;  // Definite assignment assertion
    private targetModel!: tf.LayersModel;  // Definite assignment assertion
    private replayBuffer: Array<[FuzzingState, number, number, FuzzingState, boolean]>;
    private epsilon: number;
    
    constructor(
        private readonly stateSize: number = 64,
        private readonly actionSize: number = 32,
        private readonly batchSize: number = 32,
        private readonly gamma: number = 0.99,
        private readonly epsilonDecay: number = 0.995,
        private readonly initialEpsilon: number = 1.0,
        private readonly targetUpdateFreq: number = 100
    ) {
        if (stateSize <= 0 || actionSize <= 0 || batchSize <= 0) {
            throw new ModelBuildError('Invalid model configuration: dimensions must be positive');
        }
        this.replayBuffer = [];
        this.epsilon = this.initialEpsilon;
        
        // Initialize TensorFlow.js
        tf.ready().then(() => {
            try {
                this.model = this.buildNetwork();
                this.targetModel = this.buildNetwork();
                this.updateTargetModel();
            } catch (error) {
                if (error instanceof Error) {
                    throw new ModelBuildError(`Failed to build neural network: ${error.message}`);
                }
                throw new ModelBuildError('Failed to build neural network');
            }
        }).catch(error => {
            throw new ModelBuildError(`Failed to initialize TensorFlow: ${error.message}`);
        });
    }

    /**
    * Builds the DQN network architecture
    */
    private buildNetwork(): tf.LayersModel {
        try {
            // Verify TensorFlow is properly initialized
            if (!tf || !tf.sequential || !tf.layers || !tf.train) {
                throw new Error('TensorFlow not properly initialized');
            }

            // Create model
            const model = tf.sequential();
            
            // Add layers with error handling
            try {
                // Input layer
                const inputLayer = tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    inputShape: [this.stateSize],
                    kernelInitializer: 'glorotUniform',
                    name: 'input_layer'
                });
                model.add(inputLayer);
                
                // Hidden layer
                const hiddenLayer = tf.layers.dense({
                    units: 64,
                    activation: 'relu',
                    kernelInitializer: 'glorotUniform',
                    name: 'hidden_layer'
                });
                model.add(hiddenLayer);
                
                // Output layer
                const outputLayer = tf.layers.dense({
                    units: this.actionSize,
                    activation: 'linear',
                    kernelInitializer: 'glorotUniform',
                    name: 'output_layer'
                });
                model.add(outputLayer);
            } catch (layerError) {
                throw new Error(`Failed to add layers: ${layerError instanceof Error ? layerError.message : 'Unknown error'}`);
            }

            // Compile model
            try {
                const optimizer = tf.train.adam(0.001);
                model.compile({
                    optimizer: optimizer,
                    loss: 'meanSquaredError',
                    metrics: ['mse']
                });
            } catch (compileError) {
                throw new Error(`Failed to compile model: ${compileError instanceof Error ? compileError.message : 'Unknown error'}`);
            }

            return model;
        } catch (error) {
            throw new ModelBuildError(`Failed to build network: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
    * Updates the target network weights with the main network weights
    */
    private updateTargetModel(): void {
        this.targetModel.setWeights(this.model.getWeights());
    }

    /**
    * Converts a FuzzingState to tensor representation
    */
    private stateToTensor(state: FuzzingState): tf.Tensor {
        // Validate state types
        if (typeof state.programCounter !== 'number' ||
            typeof state.coverage !== 'number' ||
            typeof state.lastCrash !== 'number' ||
            typeof state.executionTime !== 'number' ||
            !Array.isArray(state.mutationHistory)) {
            throw new Error('Invalid FuzzingState type structure');
        }
        // Convert state object to flat array with padding
        const stateArray = new Array(this.stateSize).fill(0);
        
        // Set fixed position values
        stateArray[0] = state.programCounter;
        stateArray[1] = state.coverage;
        stateArray[2] = state.lastCrash;
        stateArray[3] = state.executionTime;
        
        // Fill mutation history indices starting from index 4
        const maxMutations = this.stateSize - 4;
        for (let i = 0; i < Math.min(state.mutationHistory.length, maxMutations); i++) {
            stateArray[4 + i] = i; // Store index as ID
        }
        
        return tf.tensor2d([stateArray], [1, this.stateSize]);
    }

    /**
    * Selects an action using epsilon-greedy policy
    */
    public async selectAction(state: FuzzingState): Promise<number> {
        // Validate state before processing
        if (typeof state.programCounter !== 'number' ||
            typeof state.coverage !== 'number' ||
            typeof state.lastCrash !== 'number' ||
            typeof state.executionTime !== 'number' ||
            !Array.isArray(state.mutationHistory)) {
            throw new Error('Invalid FuzzingState type structure');
        }
        if (state.mutationHistory.length > this.stateSize - 4) {
            throw new Error(`State dimensions exceed network input size (max ${this.stateSize - 4} mutations)`);
        }
        
        // Decay epsilon on every exploration step
        if (Math.random() < this.epsilon) {
            this.epsilon *= this.epsilonDecay;
            return Math.floor(Math.random() * this.actionSize);
        }

        const stateTensor = this.stateToTensor(state);
        const predictions = await this.model.predict(stateTensor) as tf.Tensor;
        const action = predictions.argMax(1).dataSync()[0];
        
        // Cleanup tensors with null safety
        stateTensor?.dispose();
        predictions?.dispose();
        
        return action;
    }

    /**
    * Stores experience in replay buffer
    */
    public remember(state: FuzzingState, action: number, reward: number, 
                nextState: FuzzingState, done: boolean): void {
        this.replayBuffer.push([state, action, reward, nextState, done]);
        
        // Limit buffer size
        if (this.replayBuffer.length > 10000) {
            this.replayBuffer.shift();
        }
    }

    /**
    * Trains the model on a batch of experiences
    */
    public async train(): Promise<number> {
        if (this.replayBuffer.length < this.batchSize) {
            return 0;
        }

        // Sample random batch
        const batch = this.sampleBatch();
        
        const states = tf.concat(batch.map(exp => this.stateToTensor(exp[0])));
        const nextStates = tf.concat(batch.map(exp => this.stateToTensor(exp[3])));

        const currentQs = await this.model.predict(states) as tf.Tensor;
        const targetQs = await this.targetModel.predict(nextStates) as tf.Tensor;

        const updates = currentQs.arraySync() as number[][];
        
        for (let i = 0; i < this.batchSize; i++) {
            const [_, action, reward, __, done] = batch[i];
            
            if (done) {
                updates[i][action] = reward;
            } else {
                const futureQ = Math.max(...(targetQs.arraySync() as number[][])[i]);
                updates[i][action] = reward + this.gamma * futureQ;
            }
        }

        const loss = await this.model.trainOnBatch(states, tf.tensor(updates));

        // Cleanup tensors
        states.dispose();
        nextStates.dispose();
        currentQs.dispose();
        targetQs.dispose();

        // Decay epsilon
        this.epsilon *= this.epsilonDecay;
        
        return loss as number;
    }

    /**
    * Samples a random batch from replay buffer
    */
    private sampleBatch(): Array<[FuzzingState, number, number, FuzzingState, boolean]> {
        const batch = [];
        for (let i = 0; i < this.batchSize; i++) {
            const idx = Math.floor(Math.random() * this.replayBuffer.length);
            batch.push(this.replayBuffer[idx]);
        }
        return batch;
    }

    /**
    * Saves the model to the specified path
    */
    public async saveModel(path: string): Promise<void> {
        await this.model.save(`file://${path}`);
    }

    /**
    * Loads a saved model from the specified path
    */
    public async loadModel(path: string): Promise<void> {
        this.model = await tf.loadLayersModel(`file://${path}`);
        this.targetModel = await tf.loadLayersModel(`file://${path}`);
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError'
        });
    }

    /**
    * Cleans up TensorFlow resources
    */
    public dispose(): void {
        this.model.dispose();
        this.targetModel.dispose();
    }
}

