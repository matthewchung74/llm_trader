import { Agent, AgentInputItem, run, tool } from "@openai/agents";
import { config } from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import invariant from "tiny-invariant";
import { z } from "zod";
import Alpaca from "@alpacahq/alpaca-trade-api";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables from .env file
config();

// Parse model first to help determine profile name
const modelName = process.env.MODEL || "gpt-4o";

// Get profile name for file isolation
const getProfileName = (): string => {
  return process.env.PROFILE_NAME || 'openai';
};

const profileName = getProfileName();

console.log(`📁 Using profile: ${profileName} (model: ${modelName})`);

invariant(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is not set");
invariant(process.env.ALPACA_API_KEY, "ALPACA_API_KEY is not set");
invariant(process.env.ALPACA_SECRET_KEY, "ALPACA_SECRET_KEY is not set");

// Cache configuration
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "3600"); // 1 hour default
const ENABLE_EXPLICIT_CACHING = process.env.ENABLE_EXPLICIT_CACHING !== "false"; // Enabled by default

// OpenAI-specific setup only

// Create OpenAI client
const createAPIClient = (): OpenAI => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });
};


const client = createAPIClient();

// Initialize Alpaca client for paper trading
// Set environment variables for Alpaca (standard naming)
process.env.APCA_API_KEY_ID = process.env.ALPACA_API_KEY;
process.env.APCA_API_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
process.env.APCA_API_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

console.log(`🔧 Alpaca config - Base URL: ${process.env.APCA_API_BASE_URL}, Key ID: ${process.env.APCA_API_KEY_ID?.substring(0, 8)}...`);

const alpaca = new Alpaca({
  paper: true
});

// Cache tracking for analytics
let sessionCacheStats = {
  openaiCachedTokens: 0,
  totalRequests: 0
};

const log = (message: string) => {
  message = `[${new Date().toISOString()}] ${message}`;
  console.log(message);
  
  // Ensure results directory exists
  const resultsDir = `results/${profileName}`;
  try {
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }
    appendFile(`${resultsDir}/agent-${profileName}.log`, message + "\n");
  } catch (error) {
    console.error(`Failed to write to log file: ${error}`);
  }
};


const portfolioSchema = z.object({
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

// Helper function to test Alpaca connection
const testAlpacaConnection = async () => {
  try {
    log(`🔗 Testing Alpaca connection to: ${alpaca.configuration.baseUrl}`);
    log(`🗝️ Using API Key ID: ${process.env.ALPACA_API_KEY?.substring(0, 8)}...`);
    
    // Test the connection with a simple account call
    const account = await alpaca.getAccount();
    log(`✅ Alpaca connection successful - Account ID: ${account.id}`);
    return true;
  } catch (error: any) {
    log(`❌ Alpaca connection failed: ${error.message}`);
    log(`🔍 Error details: Status ${error.response?.status}, URL: ${error.config?.url}`);
    
    // Additional diagnostic information
    if (error.response?.status === 404) {
      log(`💡 404 Error suggests wrong base URL or endpoint. Current URL: ${alpaca.configuration.baseUrl}`);
      log(`💡 Try checking if ALPACA_BASE_URL environment variable is correct`);
    } else if (error.response?.status === 401) {
      log(`💡 401 Error suggests invalid API credentials`);
    } else if (error.response?.status === 403) {
      log(`💡 403 Error suggests API key doesn't have required permissions`);
    }
    
    return false;
  }
};

// Helper function to get Alpaca account information
const getAlpacaAccount = async () => {
  try {
    const account = await alpaca.getAccount();
    log(`📊 Alpaca account status: ${account.status}, buying power: $${account.buying_power}`);
    return account;
  } catch (error: any) {
    log(`❌ Failed to get Alpaca account: ${error.message || error}`);
    if (error.response?.status === 404) {
      log(`💡 Check Alpaca base URL: ${alpaca.configuration.baseUrl}`);
    }
    throw error;
  }
};

// Helper function to get Alpaca positions
const getAlpacaPositions = async () => {
  try {
    const positions = await alpaca.getPositions();
    log(`📈 Retrieved ${positions.length} positions from Alpaca`);
    return positions;
  } catch (error) {
    log(`❌ Failed to get Alpaca positions: ${error}`);
    throw error;
  }
};


// Helper function to get recent orders as trading history
const getAlpacaOrderHistory = async (limit = 50) => {
  try {
    const orders = await alpaca.getOrders({
      status: 'all',
      limit: limit,
      nested: true
    });
    log(`📋 Retrieved ${orders.length} orders from Alpaca`);
    return orders;
  } catch (error) {
    log(`❌ Failed to get Alpaca order history: ${error}`);
    throw error;
  }
};

const webSearch = async (query: string): Promise<string> => {
  try {
    const braveApiKey = process.env.BRAVE_API_KEY;
    if (!braveApiKey) {
      log(`⚠️ BRAVE_API_KEY not found, skipping web search`);
      return "Web search unavailable - API key not configured.";
    }

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        log(`⚠️ Brave Search rate limit reached, waiting 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return "Search rate limit reached, please try again in a moment.";
      }
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract relevant results and format them for trading context
    const results = data.web?.results?.slice(0, 3) || [];
    
    if (results.length === 0) {
      return `No recent news found for "${query}". Consider this in your trading decisions.`;
    }

    const summary = results.map((result: any) => {
      const title = result.title || '';
      const description = result.description || '';
      const url = result.url || '';
      
      // Format for trading relevance
      return `• ${title}\n  ${description}\n  Source: ${new URL(url).hostname}`;
    }).join('\n\n');

    const searchSummary = `Recent search results for "${query}":\n\n${summary}`;
    
    log(`✅ Brave Search found ${results.length} results for: ${query}`);
    return searchSummary;

  } catch (error) {
    log(`❌ Brave Search failed for query "${query}": ${error}`);
    return `Sorry, I couldn't search for information about "${query}" right now. Making trading decisions based on available data.`;
  }
};

const getStockPrice = async (ticker: string): Promise<number> => {
  try {
    // Try Alpaca market data first (most reliable for trading)
    try {
      const quote = await alpaca.getLatestQuote(ticker);
      if (quote && quote.BidPrice && quote.AskPrice) {
        const midPrice = (quote.BidPrice + quote.AskPrice) / 2;
        log(`✅ Found price for ${ticker}: $${midPrice.toFixed(2)} via Alpaca market data`);
        return Math.round(midPrice * 100) / 100;
      }
    } catch (alpacaError) {
      log(`⚠️ Alpaca market data failed for ${ticker}: ${alpacaError}`);
    }

    // Fallback to Yahoo Finance API
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
      if (response.ok) {
        const data = await response.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price && typeof price === 'number' && price > 0) {
          log(`✅ Found price for ${ticker}: $${price} via Yahoo Finance API`);
          return price;
        }
      }
    } catch (yahooError) {
      log(`⚠️ Yahoo Finance API failed for ${ticker}: ${yahooError}`);
    }

    // If both data sources fail, throw an error instead of using mock data
    throw new Error(`Unable to fetch price for ${ticker} from any data source`);
  } catch (error) {
    log(`❌ Failed to get stock price for ${ticker}: ${error}`);
    throw error;
  }
};

// Convert Alpaca data to portfolio format for compatibility
const getPortfolio = async (): Promise<z.infer<typeof portfolioSchema>> => {
  try {
    const [account, positions, orders] = await Promise.all([
      getAlpacaAccount(),
      getAlpacaPositions(),
      getAlpacaOrderHistory(100)
    ]);

    // Convert positions to holdings format
    const holdings: Record<string, number> = {};
    positions.forEach(position => {
      if (position.qty && parseFloat(position.qty) !== 0) {
        holdings[position.symbol] = parseFloat(position.qty);
      }
    });

    // Convert orders to history format
    const history = orders
      .filter(order => order.filled_at) // Only include filled orders
      .map(order => ({
        date: order.filled_at,
        type: order.side === 'buy' ? 'buy' as const : 'sell' as const,
        ticker: order.symbol,
        shares: parseFloat(order.filled_qty || '0'),
        price: parseFloat(order.filled_avg_price || '0'),
        total: parseFloat(order.filled_qty || '0') * parseFloat(order.filled_avg_price || '0')
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      cash: parseFloat(account.cash),
      holdings,
      history
    };
  } catch (error) {
    log(`❌ Failed to get portfolio from Alpaca: ${error}`);
    // Return empty portfolio as fallback
    return {
      cash: 0,
      holdings: {},
      history: []
    };
  }
};

const getPortfolioTool = tool({
  name: "get_portfolio",
  description: "Get your portfolio",
  parameters: z.object({}),
  async execute() {
    const portfolio = await getPortfolio();
    log(`💹 Fetched portfolio: $${portfolio.cash}`);
    return `Your cash balance is $${portfolio.cash}.
Current holdings:
${Object.entries(portfolio.holdings)
  .map(([ticker, shares]) => `  - ${ticker}: ${shares} shares`)
  .join("\n")}\n\nTrade history:
${portfolio.history
  .map(
    (trade) =>
      `  - ${trade.date} ${trade.type} ${trade.ticker} ${trade.shares} shares at $${trade.price} per share, for a total of $${trade.total}`
  )
  .join("\n")}`;
  },
});

const getNetWorthTool = tool({
  name: "get_net_worth",
  description: "Get your current net worth (total portfolio value)",
  parameters: z.object({}),
  async execute() {
    const netWorth = await calculateNetWorth();
    const portfolio = await getPortfolio();
    const annualizedReturn = await calculateAnnualizedReturn(portfolio);

    log(
      `💰 Current net worth: $${netWorth} (${annualizedReturn}% annualized return)`
    );

    return `Your current net worth is $${netWorth}
- Cash: $${portfolio.cash}
- Holdings value: $${(netWorth - portfolio.cash).toFixed(2)}
- Annualized return: ${annualizedReturn}% (started with $1,000)
- ${netWorth >= 1000 ? "📈 Up" : "📉 Down"} $${Math.abs(
      netWorth - 1000
    ).toFixed(2)} from initial investment`;
  },
});

const buyTool = tool({
  name: "buy",
  description: "Buy a given stock at the current market price using Alpaca paper trading",
  parameters: z.object({
    ticker: z.string(),
    shares: z.number().positive(),
  }),
  async execute({ ticker, shares }) {
    try {
      const account = await getAlpacaAccount();
      const price = await getStockPrice(ticker);
      const orderValue = shares * price;

      // Check if we have enough buying power
      if (parseFloat(account.buying_power) < orderValue) {
        return `You don't have enough buying power to buy ${shares} shares of ${ticker}. Your buying power is $${account.buying_power} and the estimated cost is $${orderValue.toFixed(2)}.`;
      }

      // Create market buy order through Alpaca
      const order = await alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc'
      });

      log(`💰 Submitted buy order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted buy order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated cost: $${orderValue.toFixed(2)}.`;
    } catch (error) {
      log(`❌ Failed to buy ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place buy order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  },
});

const sellTool = tool({
  name: "sell",
  description: "Sell a given stock at the current market price using Alpaca paper trading",
  parameters: z.object({
    ticker: z.string(),
    shares: z.number().positive(),
  }),
  async execute({ ticker, shares }) {
    try {
      const positions = await getAlpacaPositions();
      const position = positions.find(p => p.symbol === ticker);
      
      if (!position || parseFloat(position.qty) < shares) {
        const currentShares = position ? parseFloat(position.qty) : 0;
        return `You don't have enough shares of ${ticker} to sell. You have ${currentShares} shares.`;
      }

      const price = await getStockPrice(ticker);
      const orderValue = shares * price;

      // Create market sell order through Alpaca
      const order = await alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'sell',
        type: 'market',
        time_in_force: 'gtc'
      });

      log(`💸 Submitted sell order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted sell order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated proceeds: $${orderValue.toFixed(2)}.`;
    } catch (error) {
      log(`❌ Failed to sell ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place sell order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  },
});

const shortSellTool = tool({
  name: "short_sell",
  description: "Short sell a stock by selling shares you don't own, betting the price will decrease. Warning: Short positions have unlimited loss potential.",
  parameters: z.object({
    ticker: z.string(),
    shares: z.number().positive(),
  }),
  async execute({ ticker, shares }) {
    try {
      // Check account equity for short selling requirements
      const account = await getAlpacaAccount();
      const accountEquity = parseFloat(account.portfolio_value);
      const buyingPower = parseFloat(account.buying_power);
      
      // Alpaca requires $40,000 minimum account equity for short selling
      if (accountEquity < 40000) {
        return `Account equity of $${accountEquity.toFixed(2)} is below the $40,000 minimum required for short selling on Alpaca.`;
      }
      
      const price = await getStockPrice(ticker);
      const orderValue = shares * price;
      
      // Basic check - ensure sufficient buying power for short position
      if (buyingPower < orderValue * 0.5) { // 50% margin requirement approximation
        return `Insufficient buying power for short position. Need ~$${(orderValue * 0.5).toFixed(2)} but have $${buyingPower.toFixed(2)} buying power.`;
      }

      // Create market sell order (short sell) through Alpaca
      const order = await alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'sell',
        type: 'market',
        time_in_force: 'gtc'
      });

      log(`📉 Submitted SHORT SELL order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted SHORT SELL order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated proceeds: $${orderValue.toFixed(2)}. WARNING: This is a short position with unlimited loss potential.`;
    } catch (error) {
      log(`❌ Failed to short sell ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place short sell order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  },
});

const coverShortTool = tool({
  name: "cover_short",
  description: "Cover (close) a short position by buying back shares to close the short sale",
  parameters: z.object({
    ticker: z.string(),
    shares: z.number().positive(),
  }),
  async execute({ ticker, shares }) {
    try {
      const positions = await getAlpacaPositions();
      const position = positions.find(p => p.symbol === ticker);
      
      // Check if we have a short position (negative quantity)
      if (!position || parseFloat(position.qty) >= 0) {
        const currentShares = position ? parseFloat(position.qty) : 0;
        return `No short position found for ${ticker}. Current position: ${currentShares} shares (positive = long, negative = short).`;
      }
      
      const shortPosition = Math.abs(parseFloat(position.qty));
      if (shares > shortPosition) {
        return `Cannot cover ${shares} shares - you only have ${shortPosition} shares short in ${ticker}.`;
      }

      const price = await getStockPrice(ticker);
      const orderValue = shares * price;

      // Create market buy order to cover short position
      const order = await alpaca.createOrder({
        symbol: ticker,
        qty: shares,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc'
      });

      log(`📈 Submitted BUY TO COVER order for ${shares} shares of ${ticker} (Order ID: ${order.id})`);
      
      // Return confirmation with order details
      return `Submitted BUY TO COVER order for ${shares} shares of ${ticker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated cost: $${orderValue.toFixed(2)}.`;
    } catch (error) {
      log(`❌ Failed to cover short position for ${shares} shares of ${ticker}: ${error}`);
      return `Failed to place cover order for ${shares} shares of ${ticker}. Error: ${error}`;
    }
  },
});

const getStockPriceTool = tool({
  name: "get_stock_price",
  description: "Get the current price of a given stock ticker",
  parameters: z.object({
    ticker: z.string(),
  }),
  async execute({ ticker }) {
    const price = await getStockPrice(ticker);
    log(`🔖 Searched for stock price for ${ticker}: $${price}`);
    return price;
  },
});

const webSearchTool = tool({
  name: "web_search",
  description: "Search the web for information",
  parameters: z.object({
    query: z.string(),
  }),
  async execute({ query }: { query: string }) {
    log(`🔍 Searching the web for: ${query}`);
    const result = await webSearch(query);
    return result;
  },
});

const thinkTool = tool({
  name: "think",
  description: "Think about a given topic",
  parameters: z.object({
    thought_process: z.array(z.string()),
  }),
  async execute({ thought_process }: { thought_process: string[] }) {
    thought_process.forEach((thought: string) => log(`🧠 ${thought}`));
    return `Completed thinking with ${thought_process.length} steps of reasoning.`;
  },
});

const calculateNetWorth = async (): Promise<number> => {
  try {
    const account = await getAlpacaAccount();
    const netWorth = parseFloat(account.portfolio_value);
    log(`💰 Current net worth from Alpaca: $${netWorth}`);
    return Math.round(netWorth * 100) / 100;
  } catch (error) {
    log(`❌ Failed to get net worth from Alpaca: ${error}`);
    // Fallback to manual calculation if Alpaca fails
    const portfolio = await getPortfolio();
    let totalHoldingsValue = 0;
    for (const [ticker, shares] of Object.entries(portfolio.holdings)) {
      if (shares > 0) {
        try {
          const price = await getStockPrice(ticker);
          totalHoldingsValue += shares * price;
        } catch (error) {
          log(`⚠️ Failed to get price for ${ticker}: ${error}`);
        }
      }
    }
    const netWorth = Math.round((portfolio.cash + totalHoldingsValue) * 100) / 100;
    return netWorth;
  }
};

const calculateCAGR = (days: number, currentValue: number): number => {
  const startValue = 1000;
  const years = days / 365;
  const cagr = Math.pow(currentValue / startValue, 1 / years) - 1;
  return cagr;
};

const calculateAnnualizedReturn = async (
  portfolio: z.infer<typeof portfolioSchema>
): Promise<string> => {
  if (portfolio.history.length === 0) return "0.00";

  const firstTradeDate = new Date(portfolio.history[0].date);
  const currentDate = new Date();

  let totalHoldingsValue = 0;
  for (const [ticker, shares] of Object.entries(portfolio.holdings))
    if (shares > 0) {
      try {
        const price = await getStockPrice(ticker);
        totalHoldingsValue += shares * price;
      } catch (error) {
        log(`⚠️ Failed to get price for ${ticker}: ${error}`);
      }
    }

  const currentTotalValue = portfolio.cash + totalHoldingsValue;
  log(`💰 Current total value: $${currentTotalValue}`);

  const days =
    (currentDate.getTime() - firstTradeDate.getTime()) / (1000 * 60 * 60 * 24);
  log(`🗓 Days since first trade: ${days.toFixed(2)}`);

  if (days < 1) {
    log("⏳ Not enough time has passed to compute CAGR accurately.");
    return "N/A";
  }

  const cagr = calculateCAGR(days, currentTotalValue);
  log(`💰 CAGR: ${cagr * 100}%`);

  return (cagr * 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const calculatePortfolioValue = async (): Promise<{
  totalValue: number;
  holdings: Record<string, { shares: number; value: number }>;
}> => {
  try {
    const [account, positions] = await Promise.all([
      getAlpacaAccount(),
      getAlpacaPositions()
    ]);

    const holdingsWithValues: Record<string, { shares: number; value: number }> = {};
    
    // Use Alpaca position data which includes market values
    for (const position of positions) {
      if (parseFloat(position.qty) > 0) {
        holdingsWithValues[position.symbol] = {
          shares: parseFloat(position.qty),
          value: Math.round(parseFloat(position.market_value) * 100) / 100
        };
      }
    }

    const totalValue = Math.round(parseFloat(account.portfolio_value) * 100) / 100;
    return { totalValue, holdings: holdingsWithValues };
  } catch (error) {
    log(`❌ Failed to get portfolio value from Alpaca: ${error}`);
    // Fallback to manual calculation
    const portfolio = await getPortfolio();
    const holdingsWithValues: Record<string, { shares: number; value: number }> = {};
    let totalHoldingsValue = 0;

    for (const [ticker, shares] of Object.entries(portfolio.holdings)) {
      if (shares > 0) {
        try {
          const price = await getStockPrice(ticker);
          const value = Math.round(shares * price * 100) / 100;
          holdingsWithValues[ticker] = { shares, value };
          totalHoldingsValue += value;
        } catch (error) {
          log(`⚠️ Failed to get price for ${ticker}: ${error}`);
          holdingsWithValues[ticker] = { shares, value: 0 };
        }
      }
    }

    const totalValue = Math.round((portfolio.cash + totalHoldingsValue) * 100) / 100;
    return { totalValue, holdings: holdingsWithValues };
  }
};

const loadThread = async (): Promise<AgentInputItem[]> => {
  const threadFile = `results/${profileName}/thread-${profileName}.json`;
  try {
    if (existsSync(threadFile)) {
      const threadData = await readFile(threadFile, "utf-8");
      const fullThread = JSON.parse(threadData);
      
      // Check for thread corruption indicators
      const functionCalls = fullThread.filter((item: any) => item.type === 'function_call');
      const reasoningItems = fullThread.filter((item: any) => item.type === 'reasoning');
      
      const hasCorruption = fullThread.some((item: any) => 
        item.callId === 'call_en9S0pLVBoYjEcU4hnyuVl5X' || // GPT-4o specific corruption
        (item.type === 'function_call_result' && !fullThread.find((call: any) => call.callId === item.callId && call.type === 'function_call'))
      );
      
      // Check for OpenAI structured reasoning mismatch (function calls without reasoning)
      const hasReasoningMismatch = functionCalls.some((fc: any) => {
        if (!fc.id || !fc.id.startsWith('fc_')) return false;
        const expectedReasoningId = fc.id.replace('fc_', 'rs_');
        return !reasoningItems.some((rs: any) => rs.id === expectedReasoningId);
      });
      
      if (hasReasoningMismatch) {
        log(`🔧 Thread contains function calls without corresponding reasoning items - required for GPT-5+ models. Resetting thread.`);
        await writeFile(`${threadFile}.corrupted-${Date.now()}`, threadData);
        return [];
      }
      
      if (hasCorruption) {
        log(`🔧 Thread corruption detected (stale tool call IDs), resetting thread for clean start`);
        // Move corrupted thread to backup
        await writeFile(`${threadFile}.corrupted-${Date.now()}`, threadData);
        return [];
      }
      
      // For thread history issues, start fresh to avoid tool call ID mismatches
      if (fullThread.length > 50) {
        log(`📝 Thread history too large (${fullThread.length} items), starting fresh to avoid token issues`);
        return [];
      }
      
      return fullThread;
    }
  } catch (error) {
    log(`⚠️ Failed to load thread history: ${error}`);
  }
  return [];
};

const saveThread = async (thread: AgentInputItem[]) => {
  const threadFile = `results/${profileName}/thread-${profileName}.json`;
  try {
    // Limit thread size to prevent unbounded growth
    const maxItems = 40; // ~10 conversations worth of context
    const trimmedThread = thread.slice(-maxItems);
    
    await writeFile(threadFile, JSON.stringify(trimmedThread, null, 2));
    
    if (thread.length > maxItems) {
      log(`💾 Saved thread history (${thread.length} → ${trimmedThread.length} items, trimmed to last 10 sessions)`);
    } else {
      log(`💾 Saved thread history (${thread.length} items)`);
    }
  } catch (error) {
    log(`❌ Failed to save thread history: ${error}`);
  }
};

const updateReadme = async () => {
  const readmeFile = `results/${profileName}/README-${profileName}.md`;
  try {
    const portfolio = await getPortfolio();
    const { totalValue, holdings } = await calculatePortfolioValue();
    
    // Create profile-specific README.md if it doesn't exist
    let readmeContent;
    if (existsSync(readmeFile)) {
      readmeContent = await readFile(readmeFile, "utf-8");
    } else {
      // Create default README template
      readmeContent = `# AI Trading Agent - ${profileName.toUpperCase()} Profile

An autonomous AI-powered stock trading agent using **${modelName}** that executes trades automatically via Alpaca's paper trading API.

## Overview

This trading agent (${profileName} profile) starts with virtual capital and attempts to grow the portfolio through strategic trading decisions. All trades are executed on Alpaca's paper trading platform using real market data.

<!-- auto start -->
<!-- auto end -->

## Features

- 🤖 Autonomous trading using ${modelName}
- 📊 Real-time market data and analysis
- 💰 Paper trading through Alpaca API
- 📈 Automated portfolio tracking and reporting
- 🧠 Strategic decision-making with risk management

## Setup

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Configure environment variables in \`.env.${profileName}\`
4. Run the agent: \`dotenv -e .env.${profileName} npm start\`

## Trading Strategy

The agent follows a momentum-based trading strategy, focusing on:
- Technical analysis and market trends
- News-driven opportunities
- Risk management and diversification
- Continuous learning from trading results
`;
      log(`📝 Created new ${readmeFile} file`);
    }
    const recentTrades = portfolio.history.slice(-20).reverse();
    const annualizedReturn = await calculateAnnualizedReturn(portfolio);
    const portfolioSection = `<!-- auto start -->

## 💰 Portfolio value: $${totalValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}** (${annualizedReturn}% CAGR)

### 📊 Holdings

| Asset | Shares | Value |
|-------|--------|-------|
| Cash | - | $${portfolio.cash.toFixed(2)} |
${Object.entries(holdings)
  .map(
    ([ticker, data]) =>
      `| ${ticker} | ${data.shares} | $${data.value.toFixed(2)} |`
  )
  .join("\n")}

### 📈 Recent trades

${
  recentTrades.length > 0
    ? recentTrades
        .map((trade, index) => {
          let pnlText = "";
          
          if (trade.type === "sell") {
            // Calculate P&L for sell trades by finding matching buy trades
            const buyTrades = portfolio.history
              .filter(t => t.ticker === trade.ticker && t.type === "buy" && new Date(t.date) < new Date(trade.date))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Most recent first
            
            if (buyTrades.length > 0) {
              // Use weighted average cost basis for simplicity
              const totalBuyShares = buyTrades.reduce((sum, t) => sum + t.shares, 0);
              const totalBuyCost = buyTrades.reduce((sum, t) => sum + t.total, 0);
              const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
              
              const pnl = (trade.price - avgBuyPrice) * trade.shares;
              const pnlPercent = avgBuyPrice > 0 ? ((trade.price - avgBuyPrice) / avgBuyPrice) * 100 : 0;
              const pnlEmoji = pnl >= 0 ? "📈" : "📉";
              const pnlSign = pnl >= 0 ? "+" : "";
              
              pnlText = ` ${pnlEmoji} **P&L: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(2)}%)**`;
            }
          }
          
          return `- **${new Date(trade.date).toLocaleString("en-US", {
            timeZone: "UTC",
            dateStyle: "long",
            timeStyle: "medium",
          })}**: ${trade.type.toUpperCase()} ${trade.shares} ${
            trade.ticker
          } @ $${trade.price}/share ($${trade.total.toFixed(2)})${pnlText}`;
        })
        .slice(0, 10)
        .join("\n")
    : "- No trades yet"
}

<!-- auto end -->`;

    const updatedReadme = readmeContent.replace(
      /<!-- auto start -->[\s\S]*<!-- auto end -->/,
      portfolioSection
    );

    await writeFile(readmeFile, updatedReadme);
    log(`📝 Updated ${readmeFile} with portfolio value: $${totalValue}`);
  } catch (error) {
    log(`❌ Failed to update README: ${error}`);
  }
};

// Generate CSV P&L report for the current model
const generateCSVReport = async () => {
  try {
    // Get portfolio data from Alpaca
    const portfolio = await getPortfolio();
    
    if (!portfolio.history || portfolio.history.length === 0) {
      log("📊 No trades found for CSV report");
      return;
    }

    const modelSafe = modelName.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `results/${profileName}/pnl_${modelSafe}_${new Date().toISOString().split('T')[0]}.csv`;
    
    const csvHeader = 'Date,Type,Ticker,Shares,Price,Total,Model,P&L,P&L_Percent,Cache_Enabled,Cache_TTL\n';
    
    const csvRows = portfolio.history.map(trade => {
      let pnl = '';
      let pnlPercent = '';
      
      if (trade.type === 'sell') {
        // Calculate P&L for sell trades
        const buyTrades = portfolio.history
          .filter(t => t.ticker === trade.ticker && t.type === 'buy' && new Date(t.date) < new Date(trade.date))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (buyTrades.length > 0) {
          const totalBuyShares = buyTrades.reduce((sum, t) => sum + t.shares, 0);
          const totalBuyCost = buyTrades.reduce((sum, t) => sum + t.total, 0);
          const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
          
          const calculatedPnl = (trade.price - avgBuyPrice) * trade.shares;
          const calculatedPnlPercent = avgBuyPrice > 0 ? ((trade.price - avgBuyPrice) / avgBuyPrice) * 100 : 0;
          
          pnl = calculatedPnl.toFixed(2);
          pnlPercent = calculatedPnlPercent.toFixed(2);
        }
      }
      
      const cacheEnabled = 'auto'; // OpenAI automatic caching
      const cacheTTL = 'auto'; // OpenAI automatic cache management
      return `${trade.date},${trade.type},${trade.ticker},${trade.shares},${trade.price},${trade.total},${modelName},"${pnl}","${pnlPercent}",${cacheEnabled},${cacheTTL}`;
    });
    
    const csvContent = csvHeader + csvRows.join('\n');
    await writeFile(filename, csvContent);
    log(`📊 Generated CSV P&L report: ${filename}`);
  } catch (error) {
    log(`❌ Failed to generate CSV report: ${error}`);
  }
};

// Use the model name directly for OpenAI models
const normalizeModelName = (modelName: string): string => modelName;

const normalizedModel = normalizeModelName(modelName);

// Log which model and client are being used
log(`🤖 Using OpenAI model: ${modelName}`);
log(`🔗 Using OpenAI API`);

// Create OpenAI agent configuration
const agent = new Agent({
  name: "Assistant",
  model: normalizedModel,
  instructions: await readFile("system-prompt.md", "utf-8"),
  tools: [
    thinkTool,
    webSearchTool,
    buyTool,
    sellTool,
    shortSellTool,
    coverShortTool,
    getStockPriceTool,
    getPortfolioTool,
    getNetWorthTool,
  ],
  // Enable structured reasoning for function calls
  tool_choice: "auto",
  parallel_tool_calls: false
});

log(`🤖 Created OpenAI Agent with model: ${normalizedModel}`);

// Parse command line arguments
const args = process.argv.slice(2);
const continuousMode = args.includes('--continuous') || args.includes('-c');
const intervalMinutes = parseInt(args.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '30');

// Validate interval
if (intervalMinutes < 5) {
  log("❌ Interval must be at least 5 minutes");
  process.exit(1);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      let status = error.status;
      if (!status && error.message) {
        const match = error.message.match(/(\d{3}) status code/);
        if (match) {
          status = parseInt(match[1], 10);
        }
      }

      // Check for 429 (rate limiting) or 5xx (server errors)
      if (status === 429 || (status >= 500 && status < 600)) {
        const waitTime = delay * Math.pow(2, i) + Math.random() * 1000; // Add jitter
        log(`⚠️ API error status ${status}. Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${i + 1}/${retries})`);
        await sleep(waitTime);
      } else {
        // Don't retry for other errors (e.g., 400 bad request)
        throw error;
      }
    }
  }
  log(`❌ API call failed after ${retries} retries.`);
  throw lastError;
};

// Market hours detection
const isMarketOpen = (): boolean => {
  // Testing mode: Allow 24/7 trading for testing purposes
  if (process.env.TESTING_MODE === 'true') {
    return true;
  }
  
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  // Check if it's a weekend (Saturday = 6, Sunday = 0)
  const dayOfWeek = et.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Market hours: 9:30 AM - 4:00 PM ET
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
};

const getNextMarketOpen = (): Date => {
  const now = new Date();
  
  // Create a date object for tomorrow at 9:30 AM ET
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Set to 9:30 AM ET (13:30 UTC in summer, 14:30 UTC in winter)
  // For simplicity, we'll use 13:30 UTC (EDT summer time)
  const nextOpen = new Date(Date.UTC(
    tomorrow.getFullYear(),
    tomorrow.getMonth(), 
    tomorrow.getDate(),
    13, 30, 0, 0  // 9:30 AM ET = 13:30 UTC (EDT)
  ));
  
  // If tomorrow is Saturday, move to Monday
  if (nextOpen.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 2);
  }
  // If tomorrow is Sunday, move to Monday  
  else if (nextOpen.getDay() === 0) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  
  return nextOpen;
};



// OpenAI agent runner using the Agents SDK
const runOpenAITradingSession = async (): Promise<void> => {
  log("🚀 Starting OpenAI trading session");
  
  try {
    const thread = await loadThread();
    const currentNetWorth = await calculateNetWorth();
    const result = await withRetry(async () => {
      return await run(
        agent,
        thread.concat({
          role: "user",
          content: `It's ${new Date().toLocaleString(
            "en-US"
          )}. Time for your trading analysis! Review your portfolio, scan the markets for opportunities, and make strategic trades to grow your $${currentNetWorth.toLocaleString()} portfolio. Good luck! 📈`,
        }),
        { maxTurns: 100 }
      );
    });
    
    log(`✅ OpenAI trading session completed: ${result.finalOutput}`);
    
    await saveThread(result.history);
    await generateCSVReport();
    
  } catch (error) {
    const errorMessage = String(error);
    
    // Check for specific OpenAI reasoning/function call mismatch error
    if (errorMessage.includes('function_call') && errorMessage.includes('reasoning') && errorMessage.includes('required')) {
      log(`🔧 Detected function call/reasoning mismatch error. Clearing corrupted thread and retrying...`);
      
      // Backup the corrupted thread
      const threadFile = `results/${profileName}/thread-${profileName}.json`;
      try {
        const threadData = await readFile(threadFile, "utf-8");
        await writeFile(`${threadFile}.reasoning-error-${Date.now()}`, threadData);
        await writeFile(threadFile, JSON.stringify([], null, 2));
        log(`🧹 Thread cleared, backed up to ${threadFile}.reasoning-error-${Date.now()}`);
        
        // Retry once with clean thread
        log(`🔄 Retrying trading session with clean thread...`);
        const emptyThread: AgentInputItem[] = [];
        const currentNetWorth = await calculateNetWorth();
        const result = await withRetry(async () => {
          return await run(
            agent,
            emptyThread.concat({
              role: "user",
              content: `It's ${new Date().toLocaleString(
                "en-US"
              )}. Fresh start! Review your portfolio, scan the markets for opportunities, and make strategic trades to grow your $${currentNetWorth.toLocaleString()} portfolio. Good luck! 📈`,
            }),
            { maxTurns: 100 }
          );
        });
        
        log(`✅ OpenAI trading session completed after recovery: ${result.finalOutput}`);
        await saveThread(result.history);
        await generateCSVReport();
        return;
        
      } catch (recoveryError) {
        log(`❌ Recovery attempt failed: ${recoveryError}`);
      }
    }
    
    log(`❌ OpenAI trading session failed: ${error}`);
    throw error;
  }
};

// Log cache statistics for the session
const logCacheStats = () => {
  log(`📊 OpenAI automatic caching active - Check response logs for cached_tokens information`);
  if (sessionCacheStats.openaiCachedTokens > 0) {
    log(`💰 OpenAI cached tokens this session: ${sessionCacheStats.openaiCachedTokens} (50% cost savings)`);
  }
  
  // Reset stats for next session
  sessionCacheStats = {
    openaiCachedTokens: 0,
    totalRequests: 0
  };
};

// OpenAI trading session runner
const runTradingSession = async (): Promise<void> => {
  // Test Alpaca connection before starting trading
  const alpacaConnected = await testAlpacaConnection();
  if (!alpacaConnected) {
    log(`⚠️ Trading session continuing despite Alpaca connection issues (will use fallback data)`);
  }
  
  await runOpenAITradingSession();
  
  // Log cache statistics after session
  logCacheStats();
};

const runContinuous = async (): Promise<void> => {
  log(`🔄 Starting continuous trading mode (every ${intervalMinutes} minutes during market hours)`);
  log("📝 Press Ctrl+C to stop");
  
  let sessionCount = 0;
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log("🛑 Received shutdown signal. Completing current session...");
    process.exit(0);
  });
  
  while (true) {
    const marketOpen = isMarketOpen();
    
    if (!marketOpen) {
      const nextOpen = getNextMarketOpen();
      const hoursUntilOpen = Math.ceil((nextOpen.getTime() - Date.now()) / (1000 * 60 * 60));
      
      log(`🕐 Markets are closed. Next session when markets open: ${nextOpen.toLocaleString()}`);
      log(`💤 Sleeping for ${hoursUntilOpen} hours until market opens...`);
      
      // Sleep until market opens
      const sleepTime = nextOpen.getTime() - Date.now();
      await sleep(Math.max(sleepTime, 60000)); // At least 1 minute
      continue;
    }
    
    sessionCount++;
    
    try {
      log(`📈 Starting trading session #${sessionCount} (Markets Open)`);
      await runTradingSession();
      
      if (sessionCount === 1) {
        log(`✅ First session completed successfully`);
      }
      
      // Check if markets will still be open after the interval
      const nextRunTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      const nextMarketOpen = isMarketOpen();
      
      if (nextMarketOpen) {
        log(`⏰ Next trading session in ${intervalMinutes} minutes at ${nextRunTime.toLocaleString()}`);
        await sleep(intervalMinutes * 60 * 1000);
      } else {
        // Markets will be closed by next interval, wait until they reopen
        const nextOpen = getNextMarketOpen();
        log(`🕐 Markets closing soon. Next session when markets reopen: ${nextOpen.toLocaleString()}`);
        const sleepTime = nextOpen.getTime() - Date.now();
        await sleep(Math.max(sleepTime, 60000));
      }
      
    } catch (error) {
      log(`❌ Session #${sessionCount} failed: ${error}`);
      
      if (isMarketOpen()) {
        log(`⏰ Retrying in ${intervalMinutes} minutes...`);
        await sleep(intervalMinutes * 60 * 1000);
      } else {
        const nextOpen = getNextMarketOpen();
        log(`🕐 Markets closed. Retrying when markets reopen: ${nextOpen.toLocaleString()}`);
        const sleepTime = nextOpen.getTime() - Date.now();
        await sleep(Math.max(sleepTime, 60000));
      }
    }
  }
};

// Startup health check to prevent reasoning/function call issues
const performStartupHealthCheck = async (): Promise<void> => {
  log("🔍 Performing startup health check...");
  
  // Check thread health
  const thread = await loadThread();
  if (thread.length === 0) {
    log("✅ Thread is clean (empty)");
    return;
  }
  
  // Additional validation for edge cases
  const functionCalls = thread.filter((item: any) => item.type === 'function_call');
  const reasoningItems = thread.filter((item: any) => item.type === 'reasoning');
  
  log(`🔍 Thread contains ${thread.length} items: ${functionCalls.length} function calls, ${reasoningItems.length} reasoning items`);
  
  // Check for any orphaned function calls
  const orphanedCalls = functionCalls.filter((fc: any) => {
    if (!fc.id || !fc.id.startsWith('fc_')) return false;
    const expectedReasoningId = fc.id.replace('fc_', 'rs_');
    return !reasoningItems.some((rs: any) => rs.id === expectedReasoningId);
  });
  
  if (orphanedCalls.length > 0) {
    log(`🔧 Found ${orphanedCalls.length} orphaned function calls without reasoning items. Auto-cleaning...`);
    const threadFile = `results/${profileName}/thread-${profileName}.json`;
    const threadData = await readFile(threadFile, "utf-8");
    await writeFile(`${threadFile}.health-check-backup-${Date.now()}`, threadData);
    await writeFile(threadFile, JSON.stringify([], null, 2));
    log(`🧹 Thread cleaned up during health check`);
  } else {
    log("✅ Thread passed health check - all function calls have corresponding reasoning items");
  }
};

// Main execution logic
await performStartupHealthCheck();

if (continuousMode) {
  log("🔄 Continuous mode enabled");
  await runContinuous();
} else {
  log("🎯 Single session mode");
  const marketOpen = isMarketOpen();
  if (marketOpen) {
    log("📈 Markets are currently OPEN");
  } else {
    log("🕐 Markets are currently CLOSED");
    const nextOpen = getNextMarketOpen();
    log(`💡 Next market open: ${nextOpen.toLocaleString()}`);
  }
  await runTradingSession();
}
