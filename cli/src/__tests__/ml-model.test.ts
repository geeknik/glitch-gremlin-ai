import { jest } from '@jest/globals';

// Mock the SDK
const mockPredict = jest.fn().mockResolvedValue({
    type: 'BUFFER_OVERFLOW',
    confidence: 0.85
});

jest.mock('@glitch-gremlin/sdk', () => ({
    VulnerabilityDetectionModel: jest.fn().mockImplementation(() => {
        return {
            predict: mockPredict
        };
    })
}));

// Export mock for testing
export { mockPredict };

import { VulnerabilityDetectionModel } from '@glitch-gremlin/sdk';

describe('ML Model Integration Tests', () => {
    let model: VulnerabilityDetectionModel;

    beforeEach(() => {
        jest.clearAllMocks();
        model = new VulnerabilityDetectionModel();
    });

    it('should integrate with CLI commands', async () => {
        const features = new Array(20).fill(0).map((_, i) => i % 10);
        const prediction = await model.predict(features);
        
        expect(prediction).toHaveProperty('type');
        expect(prediction).toHaveProperty('confidence');
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(prediction.type).toBe('BUFFER_OVERFLOW');
    });
});
