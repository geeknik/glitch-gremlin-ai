import { SecurityScoring } from '../src/solana/security-scoring-model';
import { Connection, PublicKey } from '@solana/web3.js';
import * as tf from '@tensorflow/tfjs-node';
import { mock, MockProxy } from 'jest-mock-extended';

jest.mock('@tensorflow/tfjs-node', () => {
  const mockTensor = {
    dispose: jest.fn(),
    dataSync: () => new Float32Array([0.5]),
    arraySync: () => [0.5]
  };

  return {
    getBackend: jest.fn().mockReturnValue('cpu'),
    setBackend: jest.fn().mockResolvedValue(true),
    ready: jest.fn().mockResolvedValue(undefined),
    sequential: jest.fn().mockReturnValue({
      add: jest.fn().mockReturnThis(),
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({}),
      predict: jest.fn().mockReturnValue(mockTensor),
      dispose: jest.fn(),
      layers: []
    }),
    layers: {
      dense: jest.fn(),
      dropout: jest.fn()
    },
    train: {
      adam: jest.fn()
    },
    tensor: jest.fn().mockReturnValue(mockTensor),
    tensor1d: jest.fn().mockReturnValue(mockTensor),
    tensor2d: jest.fn().mockReturnValue(mockTensor)
  };
});

describe('SecurityScoringModel', () => {
    let securityScoring: SecurityScoring;
    let connection: Partial<Connection>;


    beforeEach(() => {
        // Set up the mocks for tf methods
        const tfMock = {
            sequential: jest.fn().mockReturnValue({
                add: jest.fn().mockReturnThis(),
                compile: jest.fn(),
                fit: jest.fn().mockResolvedValue({}),
                predict: jest.fn().mockReturnValue({
                    dataSync: () => new Float32Array([0.5]),
                    dispose: jest.fn()
                }),
                dispose: jest.fn(),
                layers: []
            }),
            layers: {
                dense: jest.fn().mockReturnValue({
                    apply: jest.fn()
                })
            },
            train: {
                adam: jest.fn()
            },
            tensor: jest.fn().mockReturnValue({
                dispose: jest.fn(),
                dataSync: () => new Float32Array([0.5])
            })
        };

        // No need to assign mocks as they're handled in jest.setup.ts

        // Use the shared mock implementation
        const mockModel = {
            add: jest.fn().mockReturnThis(),
            compile: jest.fn(),
            fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
            predict: jest.fn().mockReturnValue({
                dataSync: () => new Float32Array([0.5]),
                data: () => Promise.resolve(new Float32Array([0.5])),
                dispose: jest.fn(),
                shape: [1],
                arraySync: () => [[0.5]]
            }),
            dispose: jest.fn(),
            layers: [],
            save: jest.fn().mockResolvedValue(undefined),
            load: jest.fn().mockResolvedValue(undefined)
        };

        jest.spyOn(tf, 'sequential').mockReturnValue(mockModel);
        const mockTensor = {
            dispose: jest.fn(),
            data: () => Promise.resolve(new Float32Array([0.5])),
            shape: [1],
            tensor: true,  // Required for type checking
            arraySync: () => [0.5]
        };
        jest.spyOn(tf, 'tensor').mockReturnValue(mockTensor);

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
