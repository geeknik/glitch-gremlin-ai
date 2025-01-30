import * as tf from '@tensorflow/tfjs-node';
import { Sequential } from '@tensorflow/tfjs-node';
import { FuzzingState, FuzzingAction, FuzzingReward, ReinforcementConfig, VulnerabilityType } from './types.js';
import { ChaosGenerator } from './chaosGenerator.js';
import { Logger } from '../utils/logger.js';
import { PublicKey } from '@solana/web3.js';

interface Experience {
    state: FuzzingState;
    action: FuzzingAction;
    reward: FuzzingReward;
    nextState: FuzzingState;
}

export class ReinforcementFuzzer {
    private readonly mainNetwork: Sequential;
    private readonly targetNetwork: Sequential;
    private readonly config: ReinforcementConfig;
    private readonly generator: ChaosGenerator;
    private readonly logger: Logger;
    private readonly replayBuffer: Experience[] = [];
    private epsilon: number;
    private steps = 0;

    constructor(config: ReinforcementConfig, generator: ChaosGenerator) {
        this.config = config;
        this.generator = generator;
        this.logger = new Logger('ReinforcementFuzzer');
        this.epsilon = config.epsilonStart;

        // Initialize networks
        this.mainNetwork = this.createNetwork();
        this.targetNetwork = this.createNetwork();
        this.updateTargetNetwork();
    }

    private createNetwork(): Sequential {
        const model = tf.sequential();
        
        // Input layer
        model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: [this.getStateSize()]
        }));

        // Hidden layers
        for (let i = 1; i < this.config.hiddenLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.config.hiddenLayers[i],
                activation: 'relu'
            }));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: this.getActionSize(),
            activation: 'linear'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });

        return model;
    }

    private updateTargetNetwork(): void {
        const weights = this.mainNetwork.getWeights();
        this.targetNetwork.setWeights(weights);
    }

    private getStateSize(): number {
        // State features: coverage, uniquePaths, vulnerabilities, etc.
        return 10;
    }

    private getActionSize(): number {
        // Number of possible actions (MUTATE, CROSSOVER, etc.)
        return 4;
    }

    private stateToTensor(state: FuzzingState): tf.Tensor {
        const features = [
            state.metrics.coverage,
            state.metrics.uniquePaths,
            state.metrics.vulnerabilitiesFound,
            state.metrics.successRate,
            state.metrics.avgExecutionTime,
            state.programState.accounts.length,
            state.programState.slot,
            state.programState.blockTime,
            state.history.actions.length,
            state.history.rewards.reduce((a, b) => a + b, 0)
        ];

        return tf.tensor(features).expandDims(0);
    }

    private async selectAction(state: FuzzingState): Promise<FuzzingAction> {
        // Epsilon-greedy action selection
        if (Math.random() < this.epsilon) {
            return this.randomAction();
        }

        const stateTensor = this.stateToTensor(state);
        const qValues = this.mainNetwork.predict(stateTensor) as tf.Tensor;
        const actionIndex = tf.argMax(qValues, 1).dataSync()[0];
        tf.dispose([stateTensor, qValues]);

        return this.indexToAction(actionIndex);
    }

    private randomAction(): FuzzingAction {
        const actionTypes: FuzzingAction['type'][] = ['MUTATE', 'CROSSOVER', 'RESET', 'EXPLOIT'];
        const type = actionTypes[Math.floor(Math.random() * actionTypes.length)];

        return {
            type,
            params: this.getRandomActionParams(type),
            timestamp: Date.now()
        };
    }

    private getRandomActionParams(type: FuzzingAction['type']): FuzzingAction['params'] {
        switch (type) {
            case 'MUTATE':
                return {
                    mutationRate: Math.random()
                };
            case 'CROSSOVER':
                return {
                    targetAccounts: []  // Will be filled during execution
                };
            case 'EXPLOIT':
                const vulnTypes = Object.values(VulnerabilityType);
                return {
                    exploitType: vulnTypes[Math.floor(Math.random() * vulnTypes.length)]
                };
            default:
                return {};
        }
    }

    private indexToAction(index: number): FuzzingAction {
        const actionTypes: FuzzingAction['type'][] = ['MUTATE', 'CROSSOVER', 'RESET', 'EXPLOIT'];
        return {
            type: actionTypes[index],
            params: this.getRandomActionParams(actionTypes[index]),
            timestamp: Date.now()
        };
    }

    private async learn(): Promise<void> {
        if (this.replayBuffer.length < this.config.batchSize) {
            return;
        }

        // Sample batch
        const batch = this.sampleBatch();
        const states = batch.map(exp => this.stateToTensor(exp.state));
        const nextStates = batch.map(exp => this.stateToTensor(exp.nextState));

        // Get Q-values for current states
        const currentQs = this.mainNetwork.predict(tf.concat(states)) as tf.Tensor;
        const targetQs = this.targetNetwork.predict(tf.concat(nextStates)) as tf.Tensor;

        // Calculate target Q-values
        const qTargets = batch.map((exp, i) => {
            const currentQ = currentQs.slice([i, 0], [1, -1]);
            const nextQ = targetQs.slice([i, 0], [1, -1]);
            const maxNextQ = nextQ.max();
            const reward = this.calculateReward(exp.reward);
            return currentQ.add(tf.scalar(reward + this.config.discountFactor * maxNextQ.dataSync()[0]));
        });

        // Train the network
        await this.mainNetwork.fit(tf.concat(states), tf.concat(qTargets), {
            epochs: 1,
            verbose: 0
        });

        // Cleanup tensors
        tf.dispose([...states, ...nextStates, currentQs, targetQs, ...qTargets]);

        // Update target network if needed
        this.steps++;
        if (this.steps % this.config.targetUpdateFrequency === 0) {
            this.updateTargetNetwork();
        }

        // Decay epsilon
        this.epsilon = Math.max(
            this.config.epsilonEnd,
            this.epsilon * (1 - this.config.epsilonDecay)
        );
    }

    private sampleBatch(): Experience[] {
        const batch: Experience[] = [];
        for (let i = 0; i < this.config.batchSize; i++) {
            const index = Math.floor(Math.random() * this.replayBuffer.length);
            batch.push(this.replayBuffer[index]);
        }
        return batch;
    }

    private calculateReward(reward: FuzzingReward): number {
        return (
            reward.components.coverage * 0.3 +
            reward.components.vulnerabilities * 0.4 +
            reward.components.uniquePaths * 0.2 +
            (1 / (1 + reward.components.executionTime)) * 0.1
        );
    }

    public async train(initialState: FuzzingState, episodes: number): Promise<void> {
        for (let episode = 0; episode < episodes; episode++) {
            let state = initialState;
            let totalReward = 0;

            this.logger.info(`Starting episode ${episode + 1}/${episodes}`);

            while (!this.isTerminalState(state)) {
                // Select and execute action
                const action = await this.selectAction(state);
                const { nextState, reward } = await this.executeAction(action, state);

                // Store experience
                this.addExperience({ state, action, reward, nextState });

                // Learn from experiences
                await this.learn();

                // Update state and accumulate reward
                state = nextState;
                totalReward += this.calculateReward(reward);
            }

            this.logger.info(`Episode ${episode + 1} completed with total reward: ${totalReward}`);
        }
    }

    private isTerminalState(state: FuzzingState): boolean {
        // Terminal conditions: high coverage, found vulnerabilities, or timeout
        return (
            state.metrics.coverage > 0.95 ||
            state.metrics.vulnerabilitiesFound > 0 ||
            state.history.actions.length >= 1000
        );
    }

    private async executeAction(action: FuzzingAction, state: FuzzingState): Promise<{
        nextState: FuzzingState;
        reward: FuzzingReward;
    }> {
        // Execute action using ChaosGenerator
        const result = await this.generator.generateChaos({
            programId: new PublicKey(state.programState.accounts[0]?.owner || ''),
            accounts: state.programState.accounts.map(acc => new PublicKey(acc.pubkey)),
            data: action.params.data || Buffer.from([]),
            seeds: []  // TODO: Add proper seed handling
        });

        // Create next state
        const nextState: FuzzingState = {
            programState: {
                ...state.programState,
                slot: state.programState.slot + 1,
                blockTime: Date.now() / 1000
            },
            metrics: {
                coverage: result.coverage,
                uniquePaths: state.metrics.uniquePaths + (result.coverage > state.metrics.coverage ? 1 : 0),
                vulnerabilitiesFound: result.vulnerabilities.length,
                successRate: result.success ? 1 : 0,
                avgExecutionTime: state.metrics.avgExecutionTime
            },
            history: {
                actions: [...state.history.actions, action],
                rewards: [...state.history.rewards],
                states: [...state.history.states, state]
            }
        };

        // Calculate reward
        const reward: FuzzingReward = {
            value: result.success ? 1 : 0,
            components: {
                coverage: result.coverage,
                vulnerabilities: result.vulnerabilities.length,
                uniquePaths: nextState.metrics.uniquePaths - state.metrics.uniquePaths,
                executionTime: Date.now() - action.timestamp
            },
            metadata: {
                vulnerabilityTypes: result.vulnerabilities.map(v => v.type),
                newPathsFound: nextState.metrics.uniquePaths - state.metrics.uniquePaths,
                failureRate: result.success ? 0 : 1
            }
        };

        return { nextState, reward };
    }

    private addExperience(experience: Experience): void {
        this.replayBuffer.push(experience);
        if (this.replayBuffer.length > this.config.memorySize) {
            this.replayBuffer.shift();
        }
    }
}
