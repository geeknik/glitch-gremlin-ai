import * as tf from '@tensorflow/tfjs-node';
import { MutationOperator } from './mutation-operators';

/**
* Interface defining the state representation for the RL agent
*/
interface FuzzingState {
    programCounter: number;
    coverage: number;
    lastCrash: number;
    mutationHistory: MutationOperator[];
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
export class RLFuzzingModel {
    private model: tf.LayersModel;
    private targetModel: tf.LayersModel;
    private replayBuffer: Array<[FuzzingState, number, number, FuzzingState, boolean]>;
    private epsilon: number;
    
    constructor(
        private readonly stateSize: number = 64,
        private readonly actionSize: number = 32,
        private readonly batchSize: number = 32,
        private readonly gamma: number = 0.99,
        private readonly epsilonDecay: number = 0.995,
        private readonly targetUpdateFreq: number = 100
    ) {
        this.replayBuffer = [];
        this.epsilon = 1.0;
        this.model = this.buildNetwork();
        this.targetModel = this.buildNetwork();
        this.updateTargetModel();
    }

    /**
    * Builds the DQN network architecture
    */
    private buildNetwork(): tf.LayersModel {
        const model = tf.sequential();
        
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [this.stateSize]
        }));
        
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dense({
            units: this.actionSize,
            activation: 'linear'
        }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError'
        });

        return model;
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
        // Convert state object to flat array
        const stateArray = [
            state.programCounter,
            state.coverage,
            state.lastCrash,
            state.executionTime,
            ...state.mutationHistory.map(m => m.id)
        ];
        
        return tf.tensor2d([stateArray], [1, this.stateSize]);
    }

    /**
    * Selects an action using epsilon-greedy policy
    */
    public async selectAction(state: FuzzingState): Promise<number> {
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.actionSize);
        }

        const stateTensor = this.stateToTensor(state);
        const predictions = await this.model.predict(stateTensor) as tf.Tensor;
        const action = predictions.argMax(1).dataSync()[0];
        
        stateTensor.dispose();
        predictions.dispose();
        
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

        const updates = currentQs.arraySync();
        
        for (let i = 0; i < this.batchSize; i++) {
            const [_, action, reward, __, done] = batch[i];
            
            if (done) {
                updates[i][action] = reward;
            } else {
                const futureQ = Math.max(...targetQs.arraySync()[i]);
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

