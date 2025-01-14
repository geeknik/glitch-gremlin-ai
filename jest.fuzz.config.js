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
  testTimeout: 60000
};