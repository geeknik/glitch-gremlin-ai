import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import nPlugin from 'eslint-plugin-n'
import promisePlugin from 'eslint-plugin-promise'
import jestPlugin from 'eslint-plugin-jest'

/** @type {import('eslint').FlatConfig[]} */
export default [
// Base configuration for all files
{
    languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
        ...globals.node,
    },
    },
    plugins: {
    import: importPlugin,
    n: nPlugin,
    promise: promisePlugin,
    },
    settings: {
    'import/resolver': {
        node: true,
        typescript: {
        project: './tsconfig.json',
        },
    },
    },
    rules: {
    'import/no-unresolved': ['error', { ignore: ['^@/'] }],
    'n/no-missing-import': 'off',  // Handled by TypeScript
    'promise/param-names': 'error',
    },
},
// TypeScript specific configuration
{
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
    '@typescript-eslint': tseslint,
    },
    languageOptions: {
    parser: tsParser,
    parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
    },
    },
    rules: {
    ...tseslint.configs['recommended'].rules,
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    },
},
// Test files configuration
{
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    plugins: {
    jest: jestPlugin,
    },
    languageOptions: {
    globals: {
        ...globals.jest,
    },
    },
    rules: {
    // Disable strict TypeScript checks for tests
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    
    // Enable Jest-specific rules
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/valid-expect': 'error',
    'jest/expect-expect': 'error',
    'jest/no-standalone-expect': ['error', {
        additionalTestBlockFunctions: ['beforeAll', 'beforeEach', 'afterAll', 'afterEach']
    }],
    
    // Relax import rules for tests
    'import/no-unresolved': 'off',
    'import/named': 'off',
    },
},
]
