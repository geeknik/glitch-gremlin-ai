import { SecurityScoring } from '../src/solana/security-scoring-model';
import { Connection, PublicKey } from '@solana/web3.js';
import * as tf from '@tensorflow/tfjs-node';
import { mock, MockProxy } from 'jest-mock-extended';

jest.mock('@tensorflow/tfjs-node', () => ({
  tensor: jest.fn(),
  sequential: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockImplementation(function(this: any) {
      // Mock layer object
      const layer = { 
        apply: jest.fn(),
        getWeights: jest.fn().mockReturnValue([]),
        setWeights: jest.fn()
      };
      this.layers = this.layers || [];
      this.layers.push(layer);
      return this;
    }),
    compile: jest.fn(),
    predict: jest.fn().mockResolvedValue({
      data: jest.fn().mockResolvedValue(new Float32Array([0.5]))
    }),
    dispose: jest.fn(),
    fit: jest.fn().mockResolvedValue({}),
    layers: []
  } as unknown as tf.Sequential)),
  layers: {
    dense: jest.fn().mockImplementation((config: any) => ({
      ...config,
      apply: jest.fn(),
      getWeights: jest.fn().mockReturnValue([]),
      setWeights: jest.fn()
    }))
  },
  train: {
    adam: jest.fn()
  }
}));

const mockTf = jest.mocked(require('@tensorflow/tfjs-node')) as jest.Mocked<typeof tf>;

describe('SecurityScoringModel', () => {
    let securityScoring: SecurityScoring;
    let connection: Partial<Connection>;


    beforeEach(() => {
        // Set up the mocks for tf methods
        // Let the mock implementation handle object creation
        mockTf.sequential.mockImplementation(() => ({
            add: jest.fn().mockReturnThis(),
            compile: jest.fn(),
            fit: jest.fn().mockResolvedValue({}),
            predict: jest.fn().mockReturnValue({
                data: () => Promise.resolve(new Float32Array([0.5])),
                dispose: jest.fn(),
                shape: [1],
                arraySync: () => [0.5],
                rank: 1,
                dtype: 'float32',
                id: 1,
                dataId: {},
                size: 1
            } as unknown as tf.Tensor),
            dispose: jest.fn(),
            layers: [],
            optimizer: {}
        } as unknown as tf.Sequential));
        mockTf.tensor.mockReturnValue({
            dispose: jest.fn(),
            data: () => Promise.resolve(new Float32Array([0.5])),
            shape: [1],
            size: 1,
            rank: 1
        } as unknown as tf.Tensor);
        (mockTf.train.adam as jest.Mock).mockReturnValue({} as tf.Optimizer);
        (mockTf.layers.dense as jest.Mock).mockReturnValue({} as tf.layers.Layer);

        connection = {
            getAccountInfo: jest.fn().mockImplementation(() => Promise.resolve({
                lamports: 0n,
                owner: new PublicKey('11111111111111111111111111111111'),
                executable: false,
                data: Buffer.from([]),
                rentEpoch: 0
            })),
            getProgramAccounts: jest.fn().mockImplementation(() => Promise.resolve([])),
            getSlot: jest.fn().mockImplementation(() => Promise.resolve(1))
        } as unknown as Connection;

        const config = {
            thresholds: {
                high: 0.8,
                medium: 0.6,
                low: 0.4
            },
            weightings: {
                ownership: 0.6,
                access: 0.4
            }
        };

        securityScoring = new SecurityScoring(config, connection as Connection);
    });

    it('should initialize correctly', () => {
        expect(securityScoring).toBeDefined();
    });

    it('should analyze program security', async () => {
        const program = new PublicKey('11111111111111111111111111111111');
        const result = await securityScoring.analyzeProgram(program);
        expect(result).toBeDefined();
    });

    it('should return a score', async () => {
        const program = new PublicKey('11111111111111111111111111111111');
        const result = await securityScoring.analyzeProgram(program);
        expect(typeof result.score.score).toBe('number');
    });
});
