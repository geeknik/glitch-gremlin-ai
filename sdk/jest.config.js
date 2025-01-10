export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.esm.json'
    }]
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 10000,
  verbose: true,
  detectOpenHandles: true,
  transformIgnorePatterns: [
    'node_modules/(?!(?:@solana|ioredis)/)'
  ],
  globals: {
    'ts-jest': {
      useESM: true,
      isolatedModules: true,
      tsconfig: 'tsconfig.esm.json'
    }
  },
  setupFiles: ['./src/__tests__/setup.ts']
};
