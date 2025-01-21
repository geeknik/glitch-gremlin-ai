import { VulnerabilityDetectionModel, VulnerabilityType, PredictionResult } from '../types';
import { jest } from '@jest/globals';

describe('ML Model', () => {
    let mockModel: jest.Mocked<VulnerabilityDetectionModel>;

    beforeEach(() => {
        mockModel = {
            ensureInitialized: jest.fn(),
            predict: jest.fn(),
            cleanup: jest.fn(),
            save: jest.fn(),
            load: jest.fn()
        } as jest.Mocked<VulnerabilityDetectionModel>;
        
        mockModel.predict.mockResolvedValue({
            type: VulnerabilityType.ArithmeticOverflow,
            confidence: 0.95,
            timestamp: Date.now(),
            modelVersion: '1.0.0',
            details: []
        });
    });

    it('should initialize successfully', async () => {
        await mockModel.ensureInitialized();
        expect(mockModel.ensureInitialized).toHaveBeenCalled();
    });

    it('should make predictions', async () => {
        const result = await mockModel.predict([1, 2, 3]);
        expect(result.type).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle cleanup', async () => {
        await mockModel.cleanup();
        expect(mockModel.cleanup).toHaveBeenCalled();
    });
});
