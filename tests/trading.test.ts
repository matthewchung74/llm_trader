import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TradingService } from '../src/trading.js';
import { 
  createMockAlpacaClient, 
  createMockOpenAIClient, 
  mockAlpacaAccount, 
  mockAlpacaPositions, 
  mockAlpacaOrders,
  mockAlpacaQuotes 
} from './mocks/alpaca.js';
import { mockYahooFinanceFetch } from './mocks/yahoo-finance.js';

// Mock the logger module
jest.mock('../src/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    apiCall: jest.fn()
  }
}));

// Mock fetch globally
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Import the mocked logger
import { logger } from '../src/logger.js';
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('TradingService', () => {
  let tradingService: TradingService;
  let mockAlpaca: any;
  let mockOpenAI: any;

  beforeEach(() => {
    mockAlpaca = createMockAlpacaClient();
    mockOpenAI = createMockOpenAIClient();
    
    // Set up default fetch mock for Yahoo Finance
    mockFetch.mockImplementation(mockYahooFinanceFetch as any);
    
    tradingService = new TradingService(mockAlpaca, mockOpenAI);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStockPrice', () => {
    it('should return price from Alpaca when available', async () => {
      const price = await tradingService.getStockPrice('AAPL');
      
      expect(price).toBe(224.5); // Average of bid (224.45) and ask (224.55)
      expect(mockAlpaca.getLatestQuote).toHaveBeenCalledWith('AAPL');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found price for AAPL: $224.50 via Alpaca'),
        expect.any(Object)
      );
    });

    it('should fallback to Yahoo Finance when Alpaca fails', async () => {
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('Alpaca API error'));
      
      const price = await tradingService.getStockPrice('AAPL');
      
      expect(price).toBe(224.5); // From Yahoo Finance mock
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found price for AAPL: $224.5 via Yahoo Finance'),
        expect.any(Object)
      );
    });

    it('should use fallback price when both APIs fail', async () => {
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('Alpaca API error'));
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const price = await tradingService.getStockPrice('AAPL');
      
      expect(price).toBe(224.5); // Fallback price for AAPL
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Using fallback price for AAPL'),
        expect.any(Object)
      );
    });

    it('should handle unknown tickers with random fallback', async () => {
      mockAlpaca.getLatestQuote.mockRejectedValue(new Error('Symbol not found'));
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const price = await tradingService.getStockPrice('UNKNOWN');
      
      expect(price).toBeGreaterThan(50);
      expect(price).toBeLessThan(250);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Using fallback price for UNKNOWN'),
        expect.any(Object)
      );
    });
  });

  describe('getAlpacaAccount', () => {
    it('should return account information successfully', async () => {
      const account = await tradingService.getAlpacaAccount();
      
      expect(account).toEqual(mockAlpacaAccount);
      expect(mockAlpaca.getAccount).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alpaca account status: ACTIVE, buying power: $95000.00'),
        expect.any(Object)
      );
    });

    it('should throw error when Alpaca API fails', async () => {
      const error = new Error('Account fetch failed');
      mockAlpaca.getAccount.mockRejectedValue(error);
      
      await expect(tradingService.getAlpacaAccount()).rejects.toThrow('Account fetch failed');
      // The error is handled by error-handler which logs 'Network error is recoverable'
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Network error is recoverable. Retrying may help.'
      );
    });
  });

  describe('getAlpacaPositions', () => {
    it('should return positions successfully', async () => {
      const positions = await tradingService.getAlpacaPositions();
      
      expect(positions).toEqual(mockAlpacaPositions);
      expect(mockAlpaca.getPositions).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrieved 2 positions from Alpaca'),
        expect.any(Object)
      );
    });

    it('should throw error when positions fetch fails', async () => {
      const error = new Error('Positions fetch failed');
      mockAlpaca.getPositions.mockRejectedValue(error);
      
      await expect(tradingService.getAlpacaPositions()).rejects.toThrow('Positions fetch failed');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Network error is recoverable. Retrying may help.'
      );
    });
  });

  describe('getPortfolio', () => {
    it('should return portfolio with correct format', async () => {
      const portfolio = await tradingService.getPortfolio();
      
      expect(portfolio).toEqual({
        cash: 95000,
        holdings: {
          'AAPL': 10,
          'GOOGL': 5
        },
        history: [
          {
            date: '2024-01-15T10:30:05Z',
            type: 'buy',
            ticker: 'AAPL',
            shares: 5,
            price: 220,
            total: 1100
          },
          {
            date: '2024-01-15T14:20:03Z',
            type: 'buy',
            ticker: 'GOOGL',
            shares: 5,
            price: 170,
            total: 850
          }
        ]
      });
    });

    it('should return empty portfolio when APIs fail', async () => {
      mockAlpaca.getAccount.mockRejectedValue(new Error('API error'));
      mockAlpaca.getPositions.mockRejectedValue(new Error('API error'));
      mockAlpaca.getOrders.mockRejectedValue(new Error('API error'));
      
      const portfolio = await tradingService.getPortfolio();
      
      expect(portfolio).toEqual({
        cash: 0,
        holdings: {},
        history: []
      });
    });
  });

  describe('calculateNetWorth', () => {
    it('should return net worth from Alpaca account', async () => {
      const netWorth = await tradingService.calculateNetWorth();
      
      expect(netWorth).toBe(100000);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('💰 Current net worth from Alpaca: $100000'),
        undefined
      );
    });

    it('should fallback to manual calculation when Alpaca fails', async () => {
      mockAlpaca.getAccount.mockRejectedValue(new Error('Account API error'));
      
      const netWorth = await tradingService.calculateNetWorth();
      
      // When Alpaca fails, it should return 0 as fallback
      expect(netWorth).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to get net worth from Alpaca: Error: Account API error'),
        undefined
      );
    });
  });

  describe('calculateCAGR', () => {
    it('should calculate CAGR correctly', () => {
      const cagr = tradingService.calculateCAGR(365, 2000, 1000); // Doubled in 1 year
      
      expect(cagr).toBeCloseTo(1.0, 5); // 100% return
    });

    it('should handle partial years', () => {
      const cagr = tradingService.calculateCAGR(182.5, 1500, 1000); // 50% in half year
      
      expect(cagr).toBeCloseTo(1.25, 2); // Should be greater than 100% annualized
    });
  });

  describe('buyStock', () => {
    it('should place buy order successfully', async () => {
      const result = await tradingService.buyStock('AAPL', 5);
      
      expect(mockAlpaca.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 5,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc'
      });
      expect(result).toContain('Submitted buy order for 5 shares of AAPL');
      expect(result).toContain('Estimated cost: $1122.50');
    });

    it('should reject order when insufficient buying power', async () => {
      mockAlpacaAccount.buying_power = '1000.00';
      mockAlpaca.getAccount.mockResolvedValue(mockAlpacaAccount);
      
      const result = await tradingService.buyStock('AAPL', 100); // Would cost $22,450
      
      expect(result).toContain('You don\'t have enough buying power');
      expect(mockAlpaca.createOrder).not.toHaveBeenCalled();
    });

    it('should handle order creation errors', async () => {
      mockAlpaca.createOrder.mockRejectedValue(new Error('Order failed'));
      
      const result = await tradingService.buyStock('AAPL', 5);
      
      expect(result).toContain('You don\'t have enough buying power');
    });
  });

  describe('sellStock', () => {
    it('should place sell order successfully', async () => {
      const result = await tradingService.sellStock('AAPL', 5);
      
      expect(mockAlpaca.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 5,
        side: 'sell',
        type: 'market',
        time_in_force: 'gtc'
      });
      expect(result).toContain('Submitted sell order for 5 shares of AAPL');
      expect(result).toContain('Estimated proceeds: $1122.50');
    });

    it('should reject order when insufficient shares', async () => {
      const result = await tradingService.sellStock('AAPL', 20); // Only have 10 shares
      
      expect(result).toContain('You don\'t have enough shares of AAPL to sell');
      expect(result).toContain('You have 10 shares');
      expect(mockAlpaca.createOrder).not.toHaveBeenCalled();
    });

    it('should handle ticker not in portfolio', async () => {
      const result = await tradingService.sellStock('MSFT', 5);
      
      expect(result).toContain('You don\'t have enough shares of MSFT to sell');
      expect(result).toContain('You have 0 shares');
      expect(mockAlpaca.createOrder).not.toHaveBeenCalled();
    });

    it('should handle order creation errors', async () => {
      mockAlpaca.createOrder.mockRejectedValue(new Error('Sell order failed'));
      
      const result = await tradingService.sellStock('AAPL', 5);
      
      expect(result).toContain('Failed to place sell order');
      expect(result).toContain('Error: Sell order failed');
    });
  });

  describe('webSearch', () => {
    it('should return search results successfully', async () => {
      const result = await tradingService.webSearch('AAPL stock news');
      
      expect(result).toContain('Mock search result');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: 'Please search for information about: AAPL stock news. Provide a short summary of what you find.'
        }]
      });
    });

    it('should handle search API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API error'));
      
      const result = await tradingService.webSearch('test query');
      
      expect(result).toContain('Sorry, I couldn\'t search for information');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('❌ Web search failed for query "test query"'),
        undefined
      );
    });
  });
});