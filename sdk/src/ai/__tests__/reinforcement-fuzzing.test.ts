import { RLFuzzingModel, FuzzingState, FuzzingAction, FuzzingExperience } from '../src/reinforcement-fuzzing.js';
import mockTf from './__mocks__/tf-mock.js';

jest.mock('@tensorflow/tfjs-node', () => mockTf);

describe('RLFuzzingModel', () => {
    let model: RLFuzzingModel;
    const stateSize = 10;
    const actionSize = 3;

    beforeEach(() => {
        model = new RLFuzzingModel(stateSize, actionSize);
    });

    afterEach(() => {
        model.dispose();
        jest.clearAllMocks();
    });

    const createMockState = (): FuzzingState => ({
        features: Array(stateSize - 4).fill(0),
        metrics: {
            coverage: 0.5,
            uniquePaths: 10,
            vulnerabilities: 2,
            performance: 0.8
        }
    });

    const createMockAction = (): FuzzingAction => ({
        type: 'mutate',
        parameters: { rate: 0.1 }
    });

    const createMockExperience = (done = false): FuzzingExperience => ({
        state: createMockState(),
        action: createMockAction(),
        reward: 1.0,
        nextState: createMockState(),
        done
    });

    it('should initialize with correct dimensions', () => {
        expect(model).toBeDefined();
    });

    it('should predict actions', async () => {
        const state = createMockState();
        const action = await model.predict(state);
        expect(typeof action).toBe('number');
        expect(action).toBeGreaterThanOrEqual(0);
        expect(action).toBeLessThan(actionSize);
    });

    it('should train on experiences', async () => {
        const experiences = Array(32).fill(null).map(() => createMockExperience());
        const loss = await model.train(experiences);
        expect(typeof loss).toBe('number');
    });

    it('should update epsilon', () => {
        const initialEpsilon = 1.0;
        model.updateEpsilon();
        expect(model['epsilon']).toBeLessThan(initialEpsilon);
    });

    it('should save and load model', async () => {
        const path = '/tmp/model';
        await model.save(path);
        await model.load(path);
        expect(model['model']).toBeDefined();
        expect(model['targetModel']).toBeDefined();
    });

    it('should handle empty experience batch', async () => {
        const loss = await model.train([]);
        expect(loss).toBe(0);
    });

    it('should handle done states correctly', async () => {
        const experiences = Array(32).fill(null).map(() => createMockExperience(true));
        const loss = await model.train(experiences);
        expect(typeof loss).toBe('number');
    });

    it('should dispose resources properly', () => {
        model.dispose();
        expect(mockTf.dispose).toHaveBeenCalled();
    });
});

