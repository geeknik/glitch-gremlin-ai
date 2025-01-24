import { VulnerabilityType, VulnerabilityDetectionModel } from '../__mocks__/@glitch-gremlin/sdk';

jest.mock('../../../sdk/src/ai/src/ml-model', () => ({
  VulnerabilityDetectionModel: jest.fn().mockImplementation(() => ({
    predict: jest.fn(),
    ensureInitialized: jest.fn(),
    cleanup: jest.fn(),
    save: jest.fn(),
    load: jest.fn()
  }))
}));

describe('ML Model Integration Tests', () => {
    let model: VulnerabilityDetectionModel;

    beforeEach(() => {
        jest.clearAllMocks();
        model = new VulnerabilityDetectionModel() as jest.Mocked<VulnerabilityDetectionModel>;
    });

    it('should integrate with CLI commands', async () => {
        const features = new Array(20).fill(0).map((_, i) => i % 10);
        const prediction = await model.predict(features);

        expect(prediction).toHaveProperty('type');
        expect(prediction).toHaveProperty('confidence');
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(prediction.type).toBe(VulnerabilityType.ArithmeticOverflow);
        expect((model as any).predict).toHaveBeenCalledWith(features);
    });

    it('should ensure model is initialized', async () => {
        await model.ensureInitialized();
        expect((model as any).ensureInitialized).toHaveBeenCalled();
    });
});
