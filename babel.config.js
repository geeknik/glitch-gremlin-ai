export default {
  presets: [
    ['@babel/preset-env', {
      targets: { node: 'current' },
      modules: 'auto',
      useBuiltIns: 'usage',
      corejs: 3
    }],
    ['@babel/preset-typescript', {
      isTSX: true,
      allExtensions: true,
      allowDeclareFields: true,
      allowNamespaces: true,
      onlyRemoveTypeImports: true
    }],
    '@babel/preset-react'
  ],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-transform-class-properties', { loose: true }],
    '@babel/plugin-transform-object-rest-spread',
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator'
  ],
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }
  }
};
