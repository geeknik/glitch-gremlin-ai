/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/preset/default-esm',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@glitch-gremlin/sdk$': '<rootDir>/src/__mocks__/@glitch-gremlin/sdk.ts'
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            useESM: true
        }]
    },
    extensionsToTreatAsEsm: ['.ts', '.tsx', '.js'],
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,ts}',
        '<rootDir>/src/**/*.{spec,test}.{js,ts}'
    ],
    moduleDirectories: ['node_modules', '../node_modules'],
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    globals: {
        'ts-jest': {
            useESM: true,
            isolatedModules: true
        }
    },
    transformIgnorePatterns: [
        'node_modules/(?!(ts-jest|@jest)/)'
    ]
}
