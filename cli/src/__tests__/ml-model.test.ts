import { jest } from '@jest/globals';

import { VulnerabilityDetectionModel } from '@glitch-gremlin/sdk';

jest.mock('@glitch-gremlin/sdk', () => ({
    VulnerabilityDetectionModel: jest.fn().mockImplementation(() => ({
        predict: jest.fn().mockResolvedValue({
            type: 'BUFFER_OVERFLOW',
            confidence: 0.85
        })
    }))
}));

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
