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
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        isolatedModules: true
      }
    ]
  },
  modulePaths: ['<rootDir>/../sdk/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      diagnostics: {
        ignoreCodes: [1343]
      }
    }
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@solana/web3\\.js))'
  ],
  extensionsToTreatAsEsm: ['.ts']
};
