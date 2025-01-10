/** @type {import('jest').Config} */
export default {
extensionsToTreatAsEsm: ['.ts', '.tsx'],
moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
},
transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
    useESM: true,
    tsconfig: 'tsconfig.esm.json',
    isolatedModules: true
    }]
},
testEnvironment: 'node',
testMatch: ['**/__tests__/**/*.test.ts'],
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
testTimeout: 30000,
verbose: true,
detectOpenHandles: true,
transformIgnorePatterns: [
    'node_modules/(?!(?:@solana|ioredis)/)'
],
setupFiles: ['./src/__tests__/setup.ts'],
setupFilesAfterEnv: ['./src/__tests__/setupAfterEnv.ts']
};
