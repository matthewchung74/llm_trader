import { jest } from '@jest/globals';

// Mock Alpaca account data
export const mockAlpacaAccount = {
  id: 'test-account-id',
  account_number: '123456789',
  status: 'ACTIVE',
  currency: 'USD',
  buying_power: '95000.00',
  cash: '95000.00',
  portfolio_value: '100000.00',
  pattern_day_trader: false,
  trading_blocked: false,
  transfers_blocked: false,
  account_blocked: false,
  created_at: '2024-01-01T00:00:00Z',
  trade_suspended_by_user: false,
  multiplier: '2',
  sma: '100000.00',
  daytrade_count: 0,
  balance_asof: '2024-01-01T00:00:00Z'
};

// Mock Alpaca positions
export const mockAlpacaPositions = [
  {
    asset_id: 'test-asset-1',
    symbol: 'AAPL',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    avg_entry_price: '220.00',
    qty: '10',
    side: 'long',
    market_value: '2245.00',
    cost_basis: '2200.00',
    unrealized_pl: '45.00',
    unrealized_plpc: '0.0204',
    unrealized_intraday_pl: '25.00',
    unrealized_intraday_plpc: '0.0113',
    current_price: '224.50',
    lastday_price: '222.00',
    change_today: '0.0112'
  },
  {
    asset_id: 'test-asset-2',
    symbol: 'GOOGL',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    avg_entry_price: '170.00',
    qty: '5',
    side: 'long',
    market_value: '876.00',
    cost_basis: '850.00',
    unrealized_pl: '26.00',
    unrealized_plpc: '0.0305',
    unrealized_intraday_pl: '15.20',
    unrealized_intraday_plpc: '0.0176',
    current_price: '175.20',
    lastday_price: '172.00',
    change_today: '0.0186'
  }
];

// Mock Alpaca orders
export const mockAlpacaOrders = [
  {
    id: 'test-order-1',
    client_order_id: 'test-client-1',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:05Z',
    submitted_at: '2024-01-15T10:30:00Z',
    filled_at: '2024-01-15T10:30:05Z',
    expired_at: null,
    canceled_at: null,
    failed_at: null,
    replaced_at: null,
    replaced_by: null,
    replaces: null,
    asset_id: 'test-asset-1',
    symbol: 'AAPL',
    asset_class: 'us_equity',
    notional: null,
    qty: '5',
    filled_qty: '5',
    filled_avg_price: '220.00',
    order_class: '',
    order_type: 'market',
    type: 'market',
    side: 'buy',
    time_in_force: 'gtc',
    limit_price: null,
    stop_price: null,
    status: 'filled',
    extended_hours: false,
    legs: null,
    trail_percent: null,
    trail_price: null,
    hwm: null
  },
  {
    id: 'test-order-2',
    client_order_id: 'test-client-2',
    created_at: '2024-01-15T14:20:00Z',
    updated_at: '2024-01-15T14:20:03Z',
    submitted_at: '2024-01-15T14:20:00Z',
    filled_at: '2024-01-15T14:20:03Z',
    expired_at: null,
    canceled_at: null,
    failed_at: null,
    replaced_at: null,
    replaced_by: null,
    replaces: null,
    asset_id: 'test-asset-2',
    symbol: 'GOOGL',
    asset_class: 'us_equity',
    notional: null,
    qty: '5',
    filled_qty: '5',
    filled_avg_price: '170.00',
    order_class: '',
    order_type: 'market',
    type: 'market',
    side: 'buy',
    time_in_force: 'gtc',
    limit_price: null,
    stop_price: null,
    status: 'filled',
    extended_hours: false,
    legs: null,
    trail_percent: null,
    trail_price: null,
    hwm: null
  }
];

// Mock Alpaca quotes
export const mockAlpacaQuotes = {
  'AAPL': {
    symbol: 'AAPL',
    BidPrice: 224.45,
    BidSize: 100,
    AskPrice: 224.55,
    AskSize: 200,
    Timestamp: '2024-01-15T16:00:00Z'
  },
  'GOOGL': {
    symbol: 'GOOGL',
    BidPrice: 175.15,
    BidSize: 50,
    AskPrice: 175.25,
    AskSize: 75,
    Timestamp: '2024-01-15T16:00:00Z'
  }
};

// Mock Alpaca client
export const createMockAlpacaClient = (): any => ({
  // @ts-ignore - Jest mock type inference issues
  getAccount: jest.fn().mockResolvedValue(mockAlpacaAccount),
  // @ts-ignore - Jest mock type inference issues
  getPositions: jest.fn().mockResolvedValue(mockAlpacaPositions),
  // @ts-ignore - Jest mock type inference issues  
  getOrders: jest.fn().mockResolvedValue(mockAlpacaOrders),
  getLatestQuote: jest.fn().mockImplementation((symbol: any) => {
    const quote = mockAlpacaQuotes[symbol as keyof typeof mockAlpacaQuotes];
    if (quote) {
      return Promise.resolve(quote);
    }
    return Promise.reject(new Error(`No quote found for ${symbol}`));
  }),
  createOrder: jest.fn().mockImplementation((orderData: any) => {
    return Promise.resolve({
      id: `test-order-${Date.now()}`,
      client_order_id: `test-client-${Date.now()}`,
      created_at: new Date().toISOString(),
      status: 'accepted',
      symbol: orderData.symbol,
      qty: orderData.qty,
      side: orderData.side,
      type: orderData.type,
      time_in_force: orderData.time_in_force
    });
  })
});

// Mock OpenAI client
export const createMockOpenAIClient = (): any => ({
  chat: {
    completions: {
      // @ts-ignore - Jest mock type inference issues
      create: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Mock search result for the query. Market conditions are favorable for tech stocks.'
          }
        }]
      })
    }
  }
});