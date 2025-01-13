/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
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
    globals: {
        'ts-jest': {
            useESM: true
        }
    }
}
