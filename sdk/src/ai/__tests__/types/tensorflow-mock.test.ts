import { mockTf } from './tensorflow-mock';
import { describe, test, expect } from '@jest/globals';

describe('TensorFlow Mock', () => {
  test('should have all required mock functions', () => {
    expect(mockTf).toBeDefined();
    expect(mockTf.sequential).toBeDefined();
    expect(mockTf.layers.dense).toBeDefined();
    expect(mockTf.train.adam).toBeDefined();
    expect(mockTf.tensor).toBeDefined();
    expect(mockTf.tensor2d).toBeDefined();
    expect(mockTf.model).toBeDefined();
    expect(mockTf.ready).toBeDefined();
    expect(mockTf.dispose).toBeDefined();
    expect(mockTf.backend).toBeDefined();
    expect(mockTf.memory).toBeDefined();
  });
});
