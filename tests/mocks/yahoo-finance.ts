import { jest } from '@jest/globals';

// Mock Yahoo Finance API responses
export const mockYahooFinanceResponses = {
  'AAPL': {
    chart: {
      result: [{
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          firstTradeDate: 345479400,
          regularMarketTime: 1705339200,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 224.50,
          chartPreviousClose: 222.0,
          previousClose: 222.0,
          scale: 3,
          priceHint: 2,
          currentTradingPeriod: {
            pre: {
              timezone: 'EST',
              start: 1705305600,
              end: 1705325400,
              gmtoffset: -18000
            },
            regular: {
              timezone: 'EST',
              start: 1705325400,
              end: 1705348800,
              gmtoffset: -18000
            },
            post: {
              timezone: 'EST',
              start: 1705348800,
              end: 1705363200,
              gmtoffset: -18000
            }
          },
          tradingPeriods: [[{
            timezone: 'EST',
            start: 1705325400,
            end: 1705348800,
            gmtoffset: -18000
          }]],
          dataGranularity: '1d',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
        },
        timestamp: [1705325400],
        indicators: {
          quote: [{
            open: [223.5],
            low: [222.8],
            volume: [45123456],
            close: [224.5],
            high: [225.2]
          }],
          adjclose: [{
            adjclose: [224.5]
          }]
        }
      }],
      error: null
    }
  },
  'GOOGL': {
    chart: {
      result: [{
        meta: {
          currency: 'USD',
          symbol: 'GOOGL',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          firstTradeDate: 1092922200,
          regularMarketTime: 1705339200,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 175.20,
          chartPreviousClose: 172.0,
          previousClose: 172.0,
          scale: 3,
          priceHint: 2
        },
        timestamp: [1705325400],
        indicators: {
          quote: [{
            open: [173.5],
            low: [174.1],
            volume: [28567890],
            close: [175.2],
            high: [176.8]
          }],
          adjclose: [{
            adjclose: [175.2]
          }]
        }
      }],
      error: null
    }
  },
  'TSLA': {
    chart: {
      result: [{
        meta: {
          currency: 'USD',
          symbol: 'TSLA',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          regularMarketPrice: 246.80,
          previousClose: 245.0
        },
        timestamp: [1705325400],
        indicators: {
          quote: [{
            open: [245.5],
            low: [244.2],
            volume: [95432100],
            close: [246.8],
            high: [248.9]
          }],
          adjclose: [{
            adjclose: [246.8]
          }]
        }
      }],
      error: null
    }
  }
};

// Mock fetch function for Yahoo Finance API
// @ts-ignore - Jest mock parameter type inference issues
export const mockYahooFinanceFetch = jest.fn().mockImplementation((url: string) => {
  const symbolMatch = url.match(/\/chart\/([A-Z]+)\?/);
  if (symbolMatch) {
    const symbol = symbolMatch[1];
    const response = mockYahooFinanceResponses[symbol as keyof typeof mockYahooFinanceResponses];
    
    if (response) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response)
      });
    }
  }
  
  // Return error for unknown symbols
  return Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Symbol not found' })
  });
});