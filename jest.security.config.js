export default {
  testMatch: ['**/security/**/*.test.ts'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  testEnvironment: 'node',
  verbose: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/'
  ],
  testTimeout: 30000
};
