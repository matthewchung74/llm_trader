import { jest } from '@jest/globals';
import fetchMock from 'jest-fetch-mock';

// Enable fetch mocks
fetchMock.enableMocks();

// Mock environment variables for testing
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.ALPACA_API_KEY = 'test-alpaca-key';
process.env.ALPACA_SECRET_KEY = 'test-alpaca-secret';
process.env.ALPACA_BASE_URL = 'https://paper-api.alpaca.markets';

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Mock file system operations
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  appendFile: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

// Mock chalk to avoid ES module issues
jest.mock('chalk', () => ({
  default: {
    gray: (text: string) => text,
    blue: (text: string) => text,
    yellow: (text: string) => text,
    red: (text: string) => text,
    white: (text: string) => text,
  },
  gray: (text: string) => text,
  blue: (text: string) => text,
  yellow: (text: string) => text,
  red: (text: string) => text,
  white: (text: string) => text,
}));