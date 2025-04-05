import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/sdk/src', '<rootDir>/cli/src'],
  testMatch: [
    '**/src/**/__tests__/**/*.[jt]s?(x)',
    '**/src/**/?(*.)+(spec|test|tests).[jt]s?(x)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/sdk/src/index.ts',
    '^@glitch-gremlin/sdk/ai/types$': '<rootDir>/sdk/src/ai/src/types.ts',
    '^@security/(.*)$': '<rootDir>/sdk/src/ai/security/$1',
    '#cli/(.*)': '<rootDir>/cli/$1',
    '^@/(.*)$': '<rootDir>/sdk/src/$1',
    '^@ai/(.*)$': '<rootDir>/sdk/src/ai/$1',
    '^@solana/web3.js$': '<rootDir>/sdk/src/__mocks__/@solana/web3.ts',
    '^@tensorflow/tfjs-node$': '<rootDir>/sdk/src/ai/__mocks__/tfjs-node.ts'
  },
  transform: {
    '^.+\\.mjs$': ['babel-jest', {
      presets: ['@babel/preset-env']
    }],
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true,
      isolatedModules: true,
      diagnostics: false
    }],
    '^.+\\.jsx?$': ['babel-jest', {
      presets: ['@babel/preset-env']
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.jsx'],
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
  testTimeout: 60000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  automock: false,
  detectOpenHandles: true,
  transformIgnorePatterns: [
    // Keep ignoring most node_modules, but *don't* ignore specific ESM packages
    '/node_modules/(?!(dedent|@solana|@project-serum|@tensorflow|@noble|@noble/ed25519|@helius-xyz|axios|superstruct|crypto-random-string|uint8arrays|multiformats)/)',
    // Add default pnp pattern just in case
    '\\.pnp\\.[^\\/]+$',
  ],
  resolver: '<rootDir>/jest.resolver.mjs',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.ts'
  ]
};

export default config;
