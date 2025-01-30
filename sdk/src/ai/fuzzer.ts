import { VulnerabilityType, VulnerabilityAnalysis } from './types.js';
import { ChaosGenerator, ChaosConfig, ChaosResult } from './chaosGenerator.js';
import { MetricsCollector } from '../metrics/collector.js';
import { Logger } from '../utils/logger.js';
import { PublicKey } from '@solana/web3.js';

export interface FuzzInput {
    programId: PublicKey;
    accounts: PublicKey[];
    data: Buffer;
    seeds?: Buffer[];
}

export interface FuzzConfig extends ChaosConfig {
    maxIterations: number;
    timeoutMs: number;
    mutationRate: number;
    crossoverRate: number;
    populationSize: number;
    selectionPressure: number;
    targetVulnerabilities: VulnerabilityType[];
}

export interface FuzzResult {
    input: FuzzInput;
    vulnerabilities: VulnerabilityAnalysis[];
    metrics: {
        iterations: number;
        timeElapsed: number;
        successRate: number;
        coverage: number;
    };
    transactions: {
        hash: string;
        status: 'success' | 'failed';
        error?: string;
        logs?: string[];
    }[];
}

export class Fuzzer {
    private readonly config: FuzzConfig;
    private readonly generator: ChaosGenerator;
    private readonly metrics: MetricsCollector;
    private readonly logger: Logger;
    private population: FuzzInput[] = [];

    constructor(config: FuzzConfig) {
        this.config = {
            ...config,
            maxIterations: config.maxIterations || 1000,
            timeoutMs: config.timeoutMs || 300000, // 5 minutes
            mutationRate: config.mutationRate || 0.1,
            crossoverRate: config.crossoverRate || 0.7,
            populationSize: config.populationSize || 100,
            selectionPressure: config.selectionPressure || 0.8
        };
        this.generator = new ChaosGenerator(config);
        this.metrics = new MetricsCollector();
        this.logger = new Logger('Fuzzer');
    }

    public async fuzz(input: FuzzInput): Promise<FuzzResult> {
        this.logger.info('Starting fuzzing session', input);
        const startTime = Date.now();
        
        // Initialize population
        this.population = await this.initializePopulation(input);
        let bestResult: FuzzResult | null = null;
        let iteration = 0;

        while (iteration < this.config.maxIterations && 
               Date.now() - startTime < this.config.timeoutMs) {
            
            // Evolve population
            const newPopulation = await this.evolvePopulation();
            
            // Evaluate new population
            for (const candidate of newPopulation) {
                const result = await this.evaluateCandidate(candidate);
                if (this.isBetterResult(result, bestResult)) {
                    bestResult = result;
                    this.logger.info('Found better result', result);
                }
            }

            this.population = await this.selectSurvivors(this.population, newPopulation);
            iteration++;
            
            // Update metrics
            this.metrics.recordMetric('fuzzer.iteration', iteration);
            this.metrics.recordMetric('fuzzer.population_size', this.population.length);
        }

        if (!bestResult) {
            bestResult = await this.evaluateCandidate(input);
        }

        this.logger.info('Fuzzing session completed', { 
            iterations: iteration,
            timeElapsed: Date.now() - startTime,
            bestResult 
        });

        return bestResult;
    }

    private async initializePopulation(seed: FuzzInput): Promise<FuzzInput[]> {
        const population: FuzzInput[] = [seed];
        
        while (population.length < this.config.populationSize) {
            const parent = this.selectParent(population);
            const mutated = await this.mutate(parent);
            population.push(mutated);
        }

        return population;
    }

    private async evolvePopulation(): Promise<FuzzInput[]> {
        const newPopulation: FuzzInput[] = [];
        
        while (newPopulation.length < this.config.populationSize) {
            if (Math.random() < this.config.crossoverRate) {
                // Crossover
                const parent1 = this.selectParent(this.population);
                const parent2 = this.selectParent(this.population);
                const [child1, child2] = await this.crossover(parent1, parent2);
                newPopulation.push(child1, child2);
            } else {
                // Mutation
                const parent = this.selectParent(this.population);
                const mutated = await this.mutate(parent);
                newPopulation.push(mutated);
            }
        }

        return newPopulation;
    }

    private selectParent(population: FuzzInput[]): FuzzInput {
        // Tournament selection
        const tournamentSize = Math.max(2, Math.floor(population.length * this.config.selectionPressure));
        const tournament = new Array(tournamentSize)
            .fill(null)
            .map(() => population[Math.floor(Math.random() * population.length)]);
        
        return tournament[Math.floor(Math.random() * tournament.length)];
    }

    private async mutate(input: FuzzInput): Promise<FuzzInput> {
        const mutated = { ...input };

        if (Math.random() < this.config.mutationRate) {
            // Mutate instruction data
            mutated.data = await this.generator.mutateInstructionData(input.data);
        }

        if (Math.random() < this.config.mutationRate) {
            // Mutate accounts
            mutated.accounts = await this.generator.mutateAccounts(input.accounts);
        }

        if (input.seeds && Math.random() < this.config.mutationRate) {
            // Mutate PDA seeds
            mutated.seeds = await this.generator.mutateSeeds(input.seeds);
        }

        return mutated;
    }

    private async crossover(parent1: FuzzInput, parent2: FuzzInput): Promise<[FuzzInput, FuzzInput]> {
        // Single-point crossover
        const child1 = { ...parent1 };
        const child2 = { ...parent2 };

        // Crossover instruction data
        const dataPoint = Math.floor(Math.random() * parent1.data.length);
        const data1 = Buffer.concat([
            parent1.data.slice(0, dataPoint),
            parent2.data.slice(dataPoint)
        ]);
        const data2 = Buffer.concat([
            parent2.data.slice(0, dataPoint),
            parent1.data.slice(dataPoint)
        ]);
        child1.data = data1;
        child2.data = data2;

        // Crossover accounts
        const accountPoint = Math.floor(Math.random() * parent1.accounts.length);
        child1.accounts = [
            ...parent1.accounts.slice(0, accountPoint),
            ...parent2.accounts.slice(accountPoint)
        ];
        child2.accounts = [
            ...parent2.accounts.slice(0, accountPoint),
            ...parent1.accounts.slice(accountPoint)
        ];

        return [child1, child2];
    }

    private async evaluateCandidate(input: FuzzInput): Promise<FuzzResult> {
        const startTime = Date.now();
        const result = await this.generator.generateChaos(input);

        return {
            input,
            vulnerabilities: result.vulnerabilities,
            metrics: {
                iterations: 1,
                timeElapsed: Date.now() - startTime,
                successRate: result.success ? 1 : 0,
                coverage: result.coverage || 0
            },
            transactions: result.transactions
        };
    }

    private async selectSurvivors(oldPop: FuzzInput[], newPop: FuzzInput[]): Promise<FuzzInput[]> {
        // Elitism: Keep best solutions from both populations
        const combined = [...oldPop, ...newPop];
        const results = await Promise.all(combined.map(input => this.evaluateCandidate(input)));
        
        // Sort by coverage and success rate
        const sorted = combined.sort((a, b) => {
            const resultA = results.find(r => r.input === a)!;
            const resultB = results.find(r => r.input === b)!;
            return resultB.metrics.coverage - resultA.metrics.coverage;
        });

        return sorted.slice(0, this.config.populationSize);
    }

    private isBetterResult(current: FuzzResult | null, best: FuzzResult | null): boolean {
        if (!best) return true;
        if (!current) return false;

        // Compare based on multiple criteria
        const currentScore = 
            current.metrics.coverage * 0.4 +
            current.metrics.successRate * 0.3 +
            (current.vulnerabilities.length > 0 ? 0.3 : 0);

        const bestScore = 
            best.metrics.coverage * 0.4 +
            best.metrics.successRate * 0.3 +
            (best.vulnerabilities.length > 0 ? 0.3 : 0);

        return currentScore > bestScore;
    }
}
