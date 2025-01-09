/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src/index.js'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }]
  },
  extensionsToTreatAsEsm: ['.ts'],
  modulePaths: ['<rootDir>/../sdk/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.mjs'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};
