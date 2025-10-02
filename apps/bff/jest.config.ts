import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@paypay/sdk$': '<rootDir>/test/mocks/paypay-sdk.ts'
  },
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }]
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  maxWorkers: 1,
  detectOpenHandles: true,
  testTimeout: 30_000,
  forceExit: true
};

export default config;
