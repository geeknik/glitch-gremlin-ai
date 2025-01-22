import { AnomalyDetector } from '../src/anomaly-detection';
import { jest } from '@jest/globals';
import * as tf from '@tensorflow/tfjs-node';

// Use the global tf mock from jest.setup.ts


describe('AnomalyDetector', () => {
    it('should initialize correctly', () => {
        const detector = new AnomalyDetector();
        expect(detector).toBeDefined();
    });
});

