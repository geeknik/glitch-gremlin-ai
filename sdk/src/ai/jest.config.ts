import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/__tests__'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@solana/web3.js$': '<rootDir>/src/__mocks__/@solana/web3.js',
        '^@tensorflow/tfjs-node$': '<rootDir>/src/__mocks__/@tensorflow/tfjs-node'
    },
setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '@tensorflow/tfjs-node'],
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
collectCoverage: true,
coverageDirectory: 'coverage',
coverageReporters: ['json', 'lcov', 'text', 'clover'],
coverageThreshold: {
    global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
    }
},
testTimeout: 10000,
maxWorkers: '50%',
clearMocks: true,
restoreMocks: true,
verbose: true,
modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/node_modules/'
],
testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
],
coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'jest.config.ts',
    'jest.setup.ts'
]
};

export default config;

