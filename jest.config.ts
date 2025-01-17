import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
preset: 'ts-jest',
testEnvironment: 'node',
roots: ['<rootDir>/sdk/src'],
testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
],
transform: {
    '^.+\\.tsx?$': ['ts-jest', {
    tsconfig: 'tsconfig.json',
    useESM: true,
    isolatedModules: true
    }]
},
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
extensionsToTreatAsEsm: ['.ts', '.tsx'],
moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/sdk/src/$1',
    '^@ai/(.*)$': '<rootDir>/sdk/src/ai/$1'
},
setupFilesAfterEnv: [
    '<rootDir>/sdk/src/ai/__tests__/jest.setup.ts'
],
collectCoverage: true,
coverageDirectory: 'coverage',
coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/'
],
testTimeout: 10000,
verbose: true,
clearMocks: true,
restoreMocks: true,
resetMocks: true,
automock: false
};

export default config;

