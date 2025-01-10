export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^path$': 'path-browserify'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.esm.json',
      isolatedModules: true
    }]
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000,
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
  setupFiles: ['./src/__tests__/setup.ts'],
  setupFilesAfterEnv: ['./src/__tests__/setupAfterEnv.ts']
};
