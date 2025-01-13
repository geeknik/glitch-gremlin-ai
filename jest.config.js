/** @type {import('jest').Config} */
export default {
testEnvironment: 'node',
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts'],
moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.jsx?$': '$1',
    '^(\\.{1,2}/.*)\\.tsx?$': '$1',
    '^(\\.{1,2}/.*)\\.mts$': '$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src'
},
transform: {
    '^.+\\.tsx?$': ['ts-jest', {
    useESM: true,
    tsconfig: 'tsconfig.json',
    isolatedModules: true,
    diagnostics: {
        ignoreCodes: [1005, 1128, 1109, 1157, 1192, 1198, 7006, 7016, 7031]
    }
    }]
},
transformIgnorePatterns: [
    'node_modules/(?!(@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez)/.*)'
],
testEnvironmentOptions: {
    url: "http://localhost"
},
testRunner: "jest-circus/runner",
resolver: "jest-ts-resolver",
testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,ts}',
    '<rootDir>/src/**/*.{spec,test}.{js,ts}'
],
coverageDirectory: 'coverage',
coverageProvider: 'v8',
coverageReporters: ['text', 'lcov'],
collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,ts}',
    '!src/types/**/*'
],
setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
}
