export default {
    // Test environment
    testEnvironment: 'node',

    // Root directory
    rootDir: '.',

    // ESM Configuration
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'cjs', 'json', 'node'],
    moduleDirectories: ['node_modules', 'sdk/src/ai/src/__mocks__'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^(\\.{1,2}/.*)\\.mjs$': '$1',
        '^(\\.{1,2}/.*)\\.ts$': '$1',
        '^@tensorflow/(.*)$': '<rootDir>/node_modules/@tensorflow/$1',
        '^@solana/(.*)$': '<rootDir>/node_modules/@solana/$1'
    },

    // Transform configuration
    transform: {
        '^.+\\.(t|j)sx?$': ['ts-jest', {
            useESM: true,
            isolatedModules: true,
            tsconfig: 'tsconfig.json'
        }]
    },

    // Handle ES modules in node_modules
    transformIgnorePatterns: [
        'node_modules/(?!(@solana|@tensorflow|ioredis|p-timeout|p-retry|p-queue|eventemitter3)/.*)'
    ],

    // Test configuration
    testTimeout: 30000,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

    // Coverage configuration
    collectCoverage: true,
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.{js,ts}',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/build/**',
        '!**/coverage/**'
    ],
    coverageReporters: ['text', 'lcov'],

    // Mock configuration
    modulePathIgnorePatterns: [
        '<rootDir>/dist/esm/',
        '<rootDir>/dist/cjs/',
        '<rootDir>/dist/types/',
        '<rootDir>/build/'
    ],
    // Prevent duplicate mocks
    resetMocks: true,
    restoreMocks: true,
    clearMocks: true,

    // Additional settings
    testMatch: [
        '**/__tests__/**/*.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)'
    ],
    verbose: true
};
