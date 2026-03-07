import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': { tsconfig: 'tsconfig.test.json' },
  },
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 15000,
};

export default config;
