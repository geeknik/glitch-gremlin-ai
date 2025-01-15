/** @type {import('jest').Config} */
const config = {
preset: 'ts-jest/presets/default-esm',
testEnvironment: 'node',
fakeTimers: {
    enableGlobally: true,
    now: 1704819600000  // Set a fixed timestamp for reproducibility
},
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],

setupFiles: ['dotenv/config'],


transform: {
'^.+\\.(ts|tsx)$': [
    'ts-jest',
    {
    useESM: true,
    tsconfig: 'tsconfig.test.json'
    }
]
},
extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts'],
moduleNameMapper: {
'^(\\.{1,2}/.*)\\.js$': '$1',
'^(\\.{1,2}/.*)\\.mjs$': '$1',
'^(\\.{1,2}/.*)\\.cjs$': '$1',
'^@/(.*)$': '<rootDir>/src/$1',
'^@glitch-gremlin/sdk$': '<rootDir>/sdk/src',
'^@glitch-gremlin/sdk/(.*)$': '<rootDir>/sdk/src/$1', 
'^@utils/(.*)$': '<rootDir>/src/utils/$1',
'^@tests/(.*)$': '<rootDir>/src/__tests__/$1',
'^@tensorflow/tfjs-node$': '@tensorflow/tfjs',
'\\.m?jsx?$': 'babel-jest'
},
transformIgnorePatterns: [
'node_modules/(?!(@tensorflow|@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez|@jest/globals)/.*)'
]
,
testEnvironmentOptions: {
    url: "http://localhost",
    jest: true,
    env: {
    NODE_ENV: 'test'
    }
},

testTimeout: 10000,
maxWorkers: '50%',

setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
modulePaths: [
    "<rootDir>/src",
    "<rootDir>/sdk/src",
    "<rootDir>/worker/src"
],
collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
],
testEnvironment: 'node',
};

export default config;
