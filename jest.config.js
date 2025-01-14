/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src'
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
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
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
}
