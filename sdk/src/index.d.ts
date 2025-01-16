import { GlitchSDK } from './sdk.js';
import { TestType, VulnerabilityType } from './types.js';
import { GlitchError, InsufficientFundsError, InvalidProgramError, RequestTimeoutError } from './errors.js';
import { VulnerabilityDetectionModel } from './ai/ml-model.js';
import type { PredictionResult } from './ai/ml-model.js';

export {
    GlitchSDK,
    TestType,
    VulnerabilityType,
    GlitchError,
    InsufficientFundsError, 
    InvalidProgramError,
    RequestTimeoutError,
    VulnerabilityDetectionModel
};

export type { PredictionResult };

export const version: string;
