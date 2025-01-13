/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src/index.ts'
    },
    transform: {
        '^.+\\.(t|j)sx?$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.json'
        }]
    },
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,ts}',
        '<rootDir>/src/**/*.{spec,test}.{js,ts}'
    ],
    moduleDirectories: ['node_modules', '../node_modules']
}
