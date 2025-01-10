export default {
preset: 'ts-jest/preset/default-esm',
testEnvironment: 'node',
testMatch: ['**/__tests__/**/*.test.ts'],
moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
},
transform: {
    '^.+\\.tsx?$': ['ts-jest', {
    useESM: true,
    tsconfig: 'tsconfig.json'
    }]
},
extensionsToTreatAsEsm: ['.ts'],
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
testTimeout: 10000,
verbose: true,
detectOpenHandles: true,
transformIgnorePatterns: [
    'node_modules/(?!(?:@solana|ioredis)/)'
]
};
