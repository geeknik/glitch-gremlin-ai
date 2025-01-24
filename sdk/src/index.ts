export type { GovernanceConfig } from './governance';
export { GovernanceManager, ProposalState } from './governance';
export { VulnerabilityType, type PredictionResult } from './ai/src/types';
export { VulnerabilityDetectionModelImpl as VulnerabilityDetectionModel } from './ai/src/ml-model';
export * from './ai/src/types';
export const version = '0.1.0';
