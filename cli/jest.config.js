/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src/index.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        isolatedModules: true
      }
    ]
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  modulePaths: ['<rootDir>/../sdk/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.mjs'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};
