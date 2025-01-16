export default {
testMatch: ['<rootDir>/tests/security/**/*.test.ts'],
setupFilesAfterEnv: ['./jest.setup.js'],
testEnvironment: 'node',
verbose: true,
coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/'
],
testTimeout: 30000,
extensionsToTreatAsEsm: ['.ts', '.mts'],
moduleFileExtensions: ['ts', 'mts', 'js', 'mjs', 'cjs', 'jsx', 'tsx', 'json', 'node'],
transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
        useESM: true,
        isolatedModules: true,
        tsconfig: 'tsconfig.json'
    }]
},
moduleNameMapper: {
    // Handle path extensions for ESM
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    
    // Map specific Solana packages to their ESM versions
    '^@solana/web3.js$': '<rootDir>/node_modules/@solana/web3.js/lib/index.esm.js',
    '^@solana/spl-token$': '<rootDir>/node_modules/@solana/spl-token/lib/index.esm.js',
    
    // Handle remaining @solana packages
    '^@solana/(.*)$': '<rootDir>/node_modules/@solana/$1/lib/esm/index.js',
    
    // Handle other module imports
    '^@tensorflow/(.*)$': '<rootDir>/node_modules/@tensorflow/$1'
}
};
