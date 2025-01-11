import { Fuzzer } from './fuzzer';
import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from '../types';

describe('Fuzzer', () => {
  let fuzzer: Fuzzer;
  const testProgramId = new PublicKey('TestProgram111111111111111111111111111111111111');

  beforeEach(() => {
    fuzzer = new Fuzzer();
  });

  describe('generateFuzzInputs', () => {
    it('should generate the specified number of inputs', async () => {
      const inputs = await fuzzer.generateFuzzInputs(testProgramId);
      expect(inputs.length).toBe(1000);
    });

    it('should generate inputs with valid structure', async () => {
      const inputs = await fuzzer.generateFuzzInputs(testProgramId);
      inputs.forEach(input => {
        expect(input).toHaveProperty('instruction');
        expect(input).toHaveProperty('data');
        expect(input).toHaveProperty('probability');
        expect(input.data).toBeInstanceOf(Buffer);
      });
    });

    it('should sort inputs by probability', async () => {
      const inputs = await fuzzer.generateFuzzInputs(testProgramId);
      for (let i = 1; i < inputs.length; i++) {
        expect(inputs[i].probability).toBeLessThanOrEqual(inputs[i-1].probability);
      }
    });
  });

  describe('calculateProbability', () => {
    it('should return higher probability for edge case inputs', () => {
      const emptyBuffer = Buffer.alloc(0);
      const fullBuffer = Buffer.alloc(1024);
      
      const emptyProb = fuzzer['calculateProbability'](0, emptyBuffer);
      const fullProb = fuzzer['calculateProbability'](0, fullBuffer);
      const normalProb = fuzzer['calculateProbability'](0, Buffer.alloc(512));
      
      expect(emptyProb).toBeGreaterThan(normalProb);
      expect(fullProb).toBeGreaterThan(normalProb);
    });

    it('should detect interesting values in data', () => {
      const buffer = Buffer.alloc(16);
      buffer.writeBigUInt64LE(0n, 0);
      buffer.writeBigUInt64LE(1n, 8);
      
      const prob = fuzzer['calculateProbability'](0, buffer);
      expect(prob).toBeGreaterThan(0.2);
    });
  });

  describe('analyzeFuzzResult', () => {
    it('should detect arithmetic overflow', async () => {
      const result = await fuzzer.analyzeFuzzResult(
        { error: 'arithmetic operation overflow' },
        { instruction: 0, data: Buffer.alloc(0) }
      );
      expect(result.type).toBe(VulnerabilityType.ArithmeticOverflow);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect access control issues', async () => {
      const result = await fuzzer.analyzeFuzzResult(
        { error: 'unauthorized access attempt' },
        { instruction: 0, data: Buffer.alloc(0) }
      );
      expect(result.type).toBe(VulnerabilityType.AccessControl);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return null for no vulnerabilities', async () => {
      const result = await fuzzer.analyzeFuzzResult(
        { error: 'generic error' },
        { instruction: 0, data: Buffer.alloc(0) }
      );
      expect(result.type).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });
});
