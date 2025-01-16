export default {
preset: 'ts-jest/presets/default-esm',
testEnvironment: 'node',
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],

setupFiles: ['dotenv/config'],

moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/sdk/src',
    '^@glitch-gremlin/sdk/(.*)$': '<rootDir>/sdk/src/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@tests/(.*)$': '<rootDir>/src/__tests__/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
},

transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
    tsconfig: 'tsconfig.test.json',
    useESM: true,
    isolatedModules: true,
    target: 'node16'
    }],
    '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
    presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
    }]
},
transformIgnorePatterns: [
    'node_modules/(?!(@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez|@jest/globals)/.*)'
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

globals: {
    'ts-jest': {
    useESM: true,
    tsconfig: 'tsconfig.test.json'
    }
},
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
extensionsToTreatAsEsm: ['.ts', '.tsx'],
verbose: true
};
