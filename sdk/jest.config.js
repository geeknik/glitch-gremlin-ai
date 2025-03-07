export default {
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.esm.json'
        }]
    },
    testEnvironment: 'jest-environment-node',
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testTimeout: 30000,
    verbose: true,
    detectOpenHandles: true,
    transformIgnorePatterns: [
        'node_modules/(?!(?:@solana|ioredis)/)'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/coverage/'
    ],
    modulePathIgnorePatterns: [
        '<rootDir>/dist/'
    ],
    setupFilesAfterEnv: [
        '<rootDir>/src/__tests__/setupAfterEnv.ts',
        '<rootDir>/src/ai/__mocks__/@tensorflow/tfjs-node.ts'
    ]
}
