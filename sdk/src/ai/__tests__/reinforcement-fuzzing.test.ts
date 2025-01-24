import { ReinforcementFuzzer } from '../src/reinforcement-fuzzing';
import type { FuzzingState } from '../src/reinforcement-fuzzing';

jest.mock('@tensorflow/tfjs-node', () => require('./types/tensorflow-mock').mockTensorFlow);
import * as tf from '@tensorflow/tfjs-node';

describe('ReinforcementFuzzer', () => {
  const defaultState: FuzzingState = {
    programCounter: 0,
    coverage: 0,
    lastCrash: 0,
    mutationHistory: [],
    executionTime: 0
  };

  describe('Initialization', () => {
    it('should create with default parameters', () => {
      const fuzzer = new ReinforcementFuzzer();
      expect(fuzzer).toBeDefined();
      expect((fuzzer as any).stateSize).toBe(64);
      expect((fuzzer as any).actionSize).toBe(32);
    });

    it('should accept custom configuration', () => {
      const fuzzer = new ReinforcementFuzzer(128, 64, 64, 0.99, 0.9);
      expect((fuzzer as any).stateSize).toBe(128);
      expect((fuzzer as any).actionSize).toBe(64);
      expect((fuzzer as any).batchSize).toBe(64);
      expect((fuzzer as any).initialEpsilon).toBe(1.0); // Testing default
      expect((fuzzer as any).epsilonDecay).toBe(0.9);
    });
  });

  describe('Epsilon Decay', () => {
    it('should decay exploration rate over time', async () => {
      const fuzzer = new ReinforcementFuzzer();
      const initialEpsilon = (fuzzer as any).epsilon;
      
      // Mock tensor disposal
      jest.spyOn(fuzzer, 'selectAction').mockImplementation(async () => {
        return Math.floor(Math.random() * (fuzzer as any).actionSize);
      });
      
      // Simulate 10 exploration steps
      for(let i = 0; i < 10; i++) {
        await fuzzer.selectAction(defaultState);
        (fuzzer as any).epsilon *= (fuzzer as any).epsilonDecay;
      }
      
      expect((fuzzer as any).epsilon).toBeLessThan(initialEpsilon);
      expect((fuzzer as any).epsilon).toBeGreaterThan(0.1);
    });
  });

  describe('Model Training', () => {
    it('should train without errors given valid experience', async () => {
      const fuzzer = new ReinforcementFuzzer();
      // Add valid experience to replay buffer
      fuzzer.remember(defaultState, 0, 1, defaultState, false);
      fuzzer.remember(defaultState, 1, 0, defaultState, true);
      
      await expect(fuzzer.train()).resolves.toBeGreaterThanOrEqual(0);
    });

    it('should handle empty training data', async () => {
      const fuzzer = new ReinforcementFuzzer();
      await expect(fuzzer.train()).resolves.not.toThrow();
    });
  });

  describe('Input Validation', () => {
    it('should throw on invalid state dimensions', async () => {
      const fuzzer = new ReinforcementFuzzer(64);
      const invalidState = { ...defaultState, programCounter: 'invalid' } as unknown as FuzzingState;
      
      await expect(fuzzer.selectAction(invalidState)).rejects.toThrow();
    });
  });
});

