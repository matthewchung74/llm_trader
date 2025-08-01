import { z } from "zod";
import Alpaca from "@alpacahq/alpaca-trade-api";
import OpenAI from "openai";
import { logger } from './logger.js';
import { ErrorHandler, withRetry, safeExecute } from './error-handler.js';

export const portfolioSchema = z.object({
  cash: z.number(),
  holdings: z.record(z.string(), z.number()),
  history: z.array(
    z.object({
      date: z.string().datetime(),
      type: z.enum(["buy", "sell"]),
      ticker: z.string(),
      shares: z.number(),
      price: z.number(),
      total: z.number(),
    })
  ),
});

export type Portfolio = z.infer<typeof portfolioSchema>;

export class TradingService {
  private errorHandler: ErrorHandler;

  constructor(
    private alpaca: Alpaca,
    private openaiClient: OpenAI,
    private legacyLogger?: (message: string) => void
  ) {
    this.errorHandler = ErrorHandler.getInstance();
  }

  private async log(message: string, context?: Record<string, any>): Promise<void> {
    if (this.legacyLogger) {
      this.legacyLogger(message);
    }
    await logger.info(message, context);
  }

  async getStockPrice(ticker: string): Promise<number> {
    return withRetry(async () => {
      const startTime = Date.now();
      
      // Try Alpaca market data first (most reliable for trading)
      try {
        const quote = await this.alpaca.getLatestQuote(ticker);
        if (quote && quote.BidPrice && quote.AskPrice) {
          const midPrice = (quote.BidPrice + quote.AskPrice) / 2;
          const responseTime = Date.now() - startTime;
          
          await logger.info(`Found price for ${ticker}: $${midPrice.toFixed(2)} via Alpaca`, {
            ticker,
            price: midPrice,
            source: 'alpaca',
            responseTime
          });
          
          await logger.apiCall('Alpaca', 'getLatestQuote', true, responseTime);
          return Math.round(midPrice * 100) / 100;
        }
      } catch (alpacaError) {
        await this.errorHandler.handleError(alpacaError as Error, {
          operation: 'getStockPrice',
          source: 'alpaca',
          ticker
        });
      }

      // Fallback to Yahoo Finance API
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
        if (response.ok) {
          const data: any = await response.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price && typeof price === 'number' && price > 0) {
            const responseTime = Date.now() - startTime;
            
            await logger.info(`Found price for ${ticker}: $${price} via Yahoo Finance`, {
              ticker,
              price,
              source: 'yahoo',
              responseTime
            });
            
            await logger.apiCall('Yahoo', 'finance/chart', true, responseTime);
            return price;
          }
        }
      } catch (yahooError) {
        await this.errorHandler.handleError(yahooError as Error, {
          operation: 'getStockPrice',
          source: 'yahoo',
          ticker
        });
      }

      // Use realistic mock prices based on recent market data
      const mockPrices: Record<string, number> = {
        'AAPL': 224.50,
        'GOOGL': 175.20,
        'MSFT': 419.70,
        'TSLA': 246.80,
        'NVDA': 126.50,
        'XLI': 135.40,
        'HEI': 225.30,
        'RCL': 160.25,
        'NIO': 4.25,
        'XLP': 80.15,
        'XLV': 135.60,
        'XLY': 190.25,
        'XLF': 42.80,
        'SPY': 550.20
      };
      
      const fallbackPrice = mockPrices[ticker.toUpperCase()] || (50 + Math.random() * 200);
      
      await logger.warn(`Using fallback price for ${ticker}: $${fallbackPrice.toFixed(2)}`, {
        ticker,
        fallbackPrice,
        source: 'fallback'
      });
      
      return Math.round(fallbackPrice * 100) / 100;
    }, 3, 1000, { operation: 'getStockPrice', ticker });
  }

  async getAlpacaAccount() {
    try {
      const account = await this.alpaca.getAccount();
      await logger.info(`Alpaca account status: ${account.status}, buying power: $${account.buying_power}`, {
        status: account.status,
        buyingPower: account.buying_power
      });
      return account;
    } catch (error) {
      await this.errorHandler.handleError(error as Error, { operation: 'getAlpacaAccount' });
      throw error;
    }
  }

  async getAlpacaPositions() {
    try {
      const positions = await this.alpaca.getPositions();
      await this.log(`Retrieved ${positions.length} positions from Alpaca`, { count: positions.length });
      return positions;
    } catch (error) {
      await this.errorHandler.handleError(error as Error, { operation: 'getAlpacaPositions' });
      throw error;
    }
  }

  async getAlpacaOrderHistory(limit = 50) {
    try {
      const orders = await this.alpaca.getOrders({
        status: 'all',
        limit: limit,
        nested: true,
        until: null,
        after: null,
        direction: null,
        symbols: null
      } as any);
      await this.log(`Retrieved ${orders.length} orders from Alpaca`, { count: orders.length, limit });
      return orders;
    } catch (error) {
      await this.errorHandler.handleError(error as Error, { operation: 'getAlpacaOrderHistory', limit });
      throw error;
    }
  }

  async getPortfolio(): Promise<Portfolio> {
    try {
      const [account, positions, orders] = await Promise.all([
        this.getAlpacaAccount(),
        this.getAlpacaPositions(),
        this.getAlpacaOrderHistory(100)
      ]);

      // Convert positions to holdings format
      const holdings: Record<string, number> = {};
      positions.forEach((position: any) => {
        if (position.qty && parseFloat(position.qty) !== 0) {
          holdings[position.symbol] = parseFloat(position.qty);
        }
      });

      // Convert orders to history format
      const history = orders
        .filter((order: any) => order.filled_at) // Only include filled orders
        .map((order: any) => ({
          date: order.filled_at,
          type: order.side === 'buy' ? 'buy' as const : 'sell' as const,
          ticker: order.symbol,
          shares: parseFloat(order.filled_qty || '0'),
          price: parseFloat(order.filled_avg_price || '0'),
          total: parseFloat(order.filled_qty || '0') * parseFloat(order.filled_avg_price || '0')
        }))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return {
        cash: parseFloat(account.cash),
        holdings,
        history
      };
    } catch (error) {
      await this.errorHandler.handleError(error as Error, { operation: 'getPortfolio' });
      // Return empty portfolio as fallback
      return {
        cash: 0,
        holdings: {},
        history: []
      };
    }
  }

  async calculateNetWorth(): Promise<number> {
    try {
      const account = await this.getAlpacaAccount();
      const netWorth = parseFloat(account.portfolio_value);
      await this.log(`💰 Current net worth from Alpaca: $${netWorth}`);
      return Math.round(netWorth * 100) / 100;
    } catch (error) {
      await this.log(`❌ Failed to get net worth from Alpaca: ${error}`);
      // Fallback to manual calculation if Alpaca fails
      const portfolio = await this.getPortfolio();
      let totalHoldingsValue = 0;
      for (const [ticker, shares] of Object.entries(portfolio.holdings)) {
        if (shares > 0) {
          try {
            const price = await this.getStockPrice(ticker);
            totalHoldingsValue += shares * price;
          } catch (error) {
            await this.log(`⚠️ Failed to get price for ${ticker}: ${error}`);
          }
        }
      }
      const netWorth = Math.round((portfolio.cash + totalHoldingsValue) * 100) / 100;
      return netWorth;
    }
  }

  calculateCAGR(days: number, currentValue: number, startValue: number = 1000): number {
    const years = days / 365;
    const cagr = Math.pow(currentValue / startValue, 1 / years) - 1;
    return cagr;
  }

  async calculateAnnualizedReturn(portfolio: Portfolio): Promise<string> {
    if (portfolio.history.length === 0) return "0.00";

    const firstTradeDate = new Date(portfolio.history[0].date);
    const currentDate = new Date();

    let totalHoldingsValue = 0;
    for (const [ticker, shares] of Object.entries(portfolio.holdings)) {
      if (shares > 0) {
        try {
          const price = await this.getStockPrice(ticker);
          totalHoldingsValue += shares * price;
        } catch (error) {
          await this.log(`⚠️ Failed to get price for ${ticker}: ${error}`);
        }
      }
    }

    const currentTotalValue = portfolio.cash + totalHoldingsValue;
    await this.log(`💰 Current total value: $${currentTotalValue}`);

    const days =
      (currentDate.getTime() - firstTradeDate.getTime()) / (1000 * 60 * 60 * 24);
    await this.log(`🗓 Days since first trade: ${days.toFixed(2)}`);

    if (days < 1) {
      await this.log("⏳ Not enough time has passed to compute CAGR accurately.");
      return "N/A";
    }

    const cagr = this.calculateCAGR(days, currentTotalValue);
    await this.log(`💰 CAGR: ${cagr * 100}%`);

    return (cagr * 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async webSearch(query: string): Promise<string> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Please search for information about: ${query}. Provide a short summary of what you find.`,
          },
        ],
      });
      return response.choices[0]?.message?.content || "No results found.";
    } catch (error) {
      await this.log(`❌ Web search failed for query "${query}": ${error}`);
      return `Sorry, I couldn't search for information about "${query}" right now. Please try again later.`;
    }
  }

  async buyStock(ticker: string, shares: number): Promise<string> {
    try {
      const account = await this.getAlpacaAccount();
      const price = await this.getStockPrice(ticker);
      const orderValue = shares * price;

      // Check if we have enough buying power
      if (parseFloat(account.buying_power) < orderValue) {
        return `You don't have enough buying power to buy ${shares} shares of ${ticker}. Your buying power is $${account.buying_power} and the estimated cost is $${orderValue.toFixed(2)}.`;
      }

      // Create market buy order through Alpaca
      const order = await this.alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc'
      });

      await this.log(`💰 Submitted buy order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted buy order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated cost: $${orderValue.toFixed(2)}.`;
    } catch (error) {
      await this.log(`❌ Failed to buy ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place buy order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  }

  async sellStock(ticker: string, shares: number): Promise<string> {
    try {
      const positions = await this.getAlpacaPositions();
      const position = positions.find((p: any) => p.symbol === ticker);
      
      if (!position || parseFloat(position.qty) < shares) {
        const currentShares = position ? parseFloat(position.qty) : 0;
        return `You don't have enough shares of ${ticker} to sell. You have ${currentShares} shares.`;
      }

      const price = await this.getStockPrice(ticker);
      const orderValue = shares * price;

      // Create market sell order through Alpaca
      const order = await this.alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'sell',
        type: 'market',
        time_in_force: 'gtc'
      });

      await this.log(`💸 Submitted sell order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted sell order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated proceeds: $${orderValue.toFixed(2)}.`;
    } catch (error) {
      await this.log(`❌ Failed to sell ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place sell order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  }
}