import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/sdk/src', '<rootDir>/cli/src'],
  testMatch: [
    '**/src/**/__tests__/**/*.[jt]s?(x)',
    '**/src/**/?(*.)+(spec|test|tests).[jt]s?(x)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true,
      isolatedModules: true
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/sdk/src/index.ts',
    '^@glitch-gremlin/sdk/ai/types$': '<rootDir>/sdk/src/ai/src/types.ts',
    '^@security/(.*)$': '<rootDir>/sdk/src/ai/security/$1',
    '#cli/(.*)': '<rootDir>/cli/$1',
    '^@/(.*)$': '<rootDir>/sdk/src/$1',
    '^@ai/(.*)$': '<rootDir>/sdk/src/ai/$1',
    '^@tensorflow/tfjs-node$': '<rootDir>/sdk/src/ai/__mocks__/@tensorflow/tfjs-node.ts'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: [
    '<rootDir>/sdk/src/__tests__/setupAfterEnv.ts' // Removed outdated setup file
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'setup\\.ts$',
    'jest\\.setup\\.ts$',
    '__mocks__'
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/',
    '/__mocks__/'
  ],
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  automock: false
};

export default config;

