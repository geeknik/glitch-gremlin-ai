import { FuzzInput } from './fuzzer';
import { VulnerabilityType } from '../types';

export interface ChaosConfig {
  mutationRate: number;
  maxChaosLevel: number;
  targetVulnerabilities: VulnerabilityType[];
}

export class ChaosGenerator {
  private config: ChaosConfig;

  constructor(config: Partial<ChaosConfig> = {}) {
    this.config = {
      mutationRate: config.mutationRate ?? 0.1,
      maxChaosLevel: config.maxChaosLevel ?? 5,
      targetVulnerabilities: config.targetVulnerabilities ?? []
    };
  }

  public enhanceInput(input: FuzzInput, chaosLevel: number): FuzzInput {
    if (chaosLevel > this.config.maxChaosLevel) {
      throw new Error(`Chaos level ${chaosLevel} exceeds maximum ${this.config.maxChaosLevel}`);
    }

    // Apply mutations based on chaos level
    const mutatedInput = this.applyMutations(input, chaosLevel);
    
    // Adjust probability based on chaos level
    mutatedInput.probability = this.adjustProbability(mutatedInput.probability, chaosLevel);

    return mutatedInput;
  }

  private applyMutations(input: FuzzInput, chaosLevel: number): FuzzInput {
    let mutatedInput = { ...input };

    // Instruction mutation
    if (Math.random() < this.config.mutationRate * chaosLevel) {
      mutatedInput.instruction = this.mutateInstruction(input.instruction);
    }

    // Data mutation
    if (Math.random() < this.config.mutationRate * chaosLevel) {
      mutatedInput.data = this.mutateData(input.data);
    }

    return mutatedInput;
  }

  private mutateInstruction(instruction: number): number {
    // Apply bitwise operations to create edge cases
    return instruction ^ 0xFF; // Flip all bits
  }

  private mutateData(data: Uint8Array): Uint8Array {
    const mutatedData = new Uint8Array(data);
    
    // Apply mutations to each byte
    for (let i = 0; i < mutatedData.length; i++) {
      if (Math.random() < this.config.mutationRate) {
        // Create edge cases by setting to 0 or 255
        mutatedData[i] = Math.random() < 0.5 ? 0 : 255;
      }
    }

    return mutatedData;
  }

  private adjustProbability(probability: number, chaosLevel: number): number {
    // Increase probability for higher chaos levels
    return Math.min(probability + (chaosLevel * 0.1), 1.0);
  }
}
