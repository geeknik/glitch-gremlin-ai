module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@glitch-gremlin/sdk$': '<rootDir>/../sdk/src',
    '^(\\.{1,2}/.*)\\.js$': '$1' // Add .js extension mapper
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      isolatedModules: true,
      useESM: false,
      diagnostics: {
        ignoreCodes: [1005, 1128, 1109, 1157, 1192, 1198, 7006, 7016, 7031]
      }
    }]
  },
  extensionsToTreatAsEsm: ['.ts'], // Add ESM support
  transformIgnorePatterns: [
    'node_modules/(?!(@solana|@project-serum|@metaplex|@coral-xyz|@holaplex|@nfteyez)/.*)'
  ],
  testEnvironmentOptions: {
    url: "http://localhost"
  },
  testRunner: "jest-circus/runner",
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,ts}',
    '<rootDir>/src/**/*.{spec,test}.{js,ts}'
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,ts}',
    '!src/types/**/*'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
}
