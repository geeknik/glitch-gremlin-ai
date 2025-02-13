import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/sdk/src'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',
  moduleNameMapper: {
    '^@glitch-gremlin/sdk$': '<rootDir>/sdk/src/index.ts',
    '^@security/(.*)$': '<rootDir>/sdk/src/ai/security/$1',
    '^@/(.*)$': '<rootDir>/sdk/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest', 
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
        diagnostics: false
      }
    ]
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '__mocks__'
  ],
  coveragePathIgnorePatterns: [
    '__tests__',
    '__mocks__'
  ],
  maxWorkers: '50%',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testTimeout: 30000,
  verbose: true,
  detectOpenHandles: true
};

export default config;
