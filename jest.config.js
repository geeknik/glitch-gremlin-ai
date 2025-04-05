module.exports = {
  transform: {
    '^.+\\.(js|jsx|mjs)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(dedent|@jest/))'
  ],
  extensionsToTreatAsEsm: ['.js', '.mjs'],
  testEnvironment: 'node'
};
