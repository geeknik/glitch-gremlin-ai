/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src',
    '^@glitch-gremlin/sdk/(.*)$': '<rootDir>/../sdk/src/$1'
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: false
    }],
    '^.+\\.jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez)/.*)'
  ],
  testEnvironmentOptions: {
    url: "http://localhost"
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/sdk/src/__tests__/setupAfterEnv.ts'],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};

export default config;
