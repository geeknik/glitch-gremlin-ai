import { describe, test, expect } from '@jest/globals';
import { mockTf } from './tensorflow-mock';

describe('TensorFlowMock Type Checks', () => {
  test('mock structure matches interface', () => {
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
