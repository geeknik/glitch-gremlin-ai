export default {
  testMatch: ['<rootDir>/tests/fuzz/**/*.test.ts'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  testEnvironment: 'node',
  verbose: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/'
  ],
  testTimeout: 60000,
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
        useESM: true,
        isolatedModules: true,
        tsconfig: 'tsconfig.json'
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    '^@tensorflow/(.*)$': '<rootDir>/node_modules/@tensorflow/$1',
    '^@solana/(.*)$': '<rootDir>/node_modules/@solana/$1'
  }
};
