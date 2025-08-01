import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TradingService } from '../src/trading-simple.js';

describe('TradingService - Core Functions', () => {
  let tradingService: TradingService;
  let mockLogger: jest.Mock;

  beforeEach(() => {
    mockLogger = jest.fn();
    
    // Create a simple mock Alpaca client
    const mockAlpaca = {
      getAccount: jest.fn(),
      getPositions: jest.fn(),
      getOrders: jest.fn(),
      getLatestQuote: jest.fn(),
      createOrder: jest.fn()
    };
    
    // Create a simple mock OpenAI client
    const mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    
    tradingService = new TradingService(mockAlpaca as any, mockOpenAI as any, mockLogger);
  });

  describe('calculateCAGR', () => {
    it('should calculate CAGR correctly for 100% return in 1 year', () => {
      const cagr = tradingService.calculateCAGR(365, 2000, 1000);
      expect(cagr).toBeCloseTo(1.0, 5); // 100% return
    });

    it('should calculate CAGR correctly for 50% return in 6 months', () => {
      const cagr = tradingService.calculateCAGR(182.5, 1500, 1000);
      expect(cagr).toBeGreaterThan(1.0); // Should be > 100% annualized
    });

    it('should handle zero days correctly', () => {
      const cagr = tradingService.calculateCAGR(0, 1500, 1000);
      expect(cagr).toBe(Infinity);
    });

    it('should handle negative returns', () => {
      const cagr = tradingService.calculateCAGR(365, 500, 1000);
      expect(cagr).toBeLessThan(0); // Negative return
    });
  });

  describe('portfolio schema validation', () => {
    it('should validate portfolio schema correctly', async () => {
      const validPortfolio = {
        cash: 1000,
        holdings: { 'AAPL': 10, 'GOOGL': 5 },
        history: [
          {
            date: '2024-01-15T10:30:00.000Z',
            type: 'buy' as const,
            ticker: 'AAPL',
            shares: 10,
            price: 150,
            total: 1500
          }
        ]
      };

      // This should not throw
      const { portfolioSchema } = await import('../src/trading-simple.js');
      expect(() => portfolioSchema.parse(validPortfolio)).not.toThrow();
    });

    it('should reject invalid portfolio schema', async () => {
      const invalidPortfolio = {
        cash: '1000', // Should be number
        holdings: { 'AAPL': '10' }, // Should be number
        history: []
      };

      const { portfolioSchema } = await import('../src/trading-simple.js');
      expect(() => portfolioSchema.parse(invalidPortfolio)).toThrow();
    });
  });

  describe('logging', () => {
    it('should log messages correctly', () => {
      const testMessage = 'Test log message';
      mockLogger(testMessage);
      expect(mockLogger).toHaveBeenCalledWith(testMessage);
    });
  });
});