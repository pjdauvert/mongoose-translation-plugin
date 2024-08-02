import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/*.test.ts'],
  setupFilesAfterEnv: ['jest-extended/all', 'dotenv/config', '<rootDir>/src/__tests__/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/src/examples/'],
  collectCoverage: true,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/src/examples/', '/src/__tests__/', 'index.ts']
};

export default config;
