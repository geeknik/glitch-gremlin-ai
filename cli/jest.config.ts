import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
preset: 'ts-jest/presets/default-esm',
testEnvironment: 'node',
extensionsToTreatAsEsm: ['.ts'],
moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '@glitch-gremlin/sdk': '<rootDir>/src/__mocks__/@glitch-gremlin/sdk.ts'
},
transform: {
    '^.+\\.tsx?$': [
    'ts-jest',
    {
        useESM: true,
        tsconfig: './tsconfig.json'
    }
    ]
},
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
roots: ['<rootDir>/src'],
collectCoverage: true,
coverageDirectory: 'coverage',
coverageReporters: ['text', 'lcov'],
verbose: true
};

export default config;

