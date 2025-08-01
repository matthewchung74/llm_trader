import { z } from "zod";

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
  constructor(
    private alpaca: any,
    private openaiClient: any,
    private logger?: (message: string) => void
  ) {}

  calculateCAGR(days: number, currentValue: number, startValue: number = 1000): number {
    const years = days / 365;
    const cagr = Math.pow(currentValue / startValue, 1 / years) - 1;
    return cagr;
  }

  async getStockPrice(ticker: string): Promise<number> {
    // Mock implementation for testing
    const mockPrices: Record<string, number> = {
      'AAPL': 224.50,
      'GOOGL': 175.20,
      'MSFT': 419.70,
      'TSLA': 246.80,
    };
    
    return mockPrices[ticker.toUpperCase()] || 100;
  }

  async getPortfolio(): Promise<Portfolio> {
    // Mock implementation for testing
    return {
      cash: 1000,
      holdings: { 'AAPL': 10 },
      history: [
        {
          date: '2024-01-15T10:30:00.000Z',
          type: 'buy',
          ticker: 'AAPL',
          shares: 10,
          price: 150,
          total: 1500
        }
      ]
    };
  }
}