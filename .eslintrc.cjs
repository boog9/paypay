/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('node:path');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  env: {
    es2022: true,
    node: true,
    browser: true
  },
  plugins: ['@typescript-eslint', 'import', 'unused-imports', 'react', 'react-hooks', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier'
  ],
  settings: {
    react: {
      version: 'detect'
    },
    'import/resolver': {
      typescript: {
        project: [
          path.resolve(__dirname, 'apps/frontend/tsconfig.json'),
          path.resolve(__dirname, 'apps/bff/tsconfig.json'),
          path.resolve(__dirname, 'packages/sdk/tsconfig.json')
        ]
      }
    }
  },
  ignorePatterns: ['dist', '.next', 'node_modules', 'packages/sdk/src/gen/*.d.ts'],
  overrides: [
    {
      files: ['apps/frontend/**/*.{ts,tsx}'],
      parserOptions: {
        project: path.resolve(__dirname, 'apps/frontend/tsconfig.json')
      },
      extends: ['next/core-web-vitals']
    },
    {
      files: ['apps/bff/**/*.ts'],
      parserOptions: {
        project: path.resolve(__dirname, 'apps/bff/tsconfig.json')
      }
    },
    {
      files: ['packages/sdk/**/*.ts'],
      parserOptions: {
        project: path.resolve(__dirname, 'packages/sdk/tsconfig.json')
      }
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        'import/no-unresolved': 'off'
      }
    }
  ],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    'unused-imports/no-unused-imports': 'error'
  }
};
