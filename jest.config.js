/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^(\\.{1,2}/.*)\\.jsx?$': '$1',
        '^(\\.{1,2}/.*)\\.tsx?$': '$1',
    },
    transform: {
        '^.+\\.(t|j)sx?$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.json',
            isolatedModules: true
        }],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez)/.*)'
    ],
    testEnvironmentOptions: {
        url: "http://localhost"
    },
    resolver: "jest-ts-resolver",
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
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
        '!src/types/**/*',
    ],
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
            useESM: true
        }
    }
}
