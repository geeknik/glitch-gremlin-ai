const { Config } = require('@jest/types');
/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
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
    }],
    '^.+\\.jsx?$': ['babel-jest', {
      presets: ['@babel/preset-env']
    }]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(crypto-random-string)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/sdk/src/index.ts',
    '^@glitch-gremlin/sdk/ai/types$': '<rootDir>/sdk/src/ai/src/types.ts',
    '^@security/(.*)$': '<rootDir>/sdk/src/ai/security/$1',
    '#cli/(.*)': '<rootDir>/cli/$1',
    '^@/(.*)$': '<rootDir>/sdk/src/$1',
    '^@ai/(.*)$': '<rootDir>/sdk/src/ai/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.ts'
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
  testTimeout: 60000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  automock: false
};

module.exports = config;
