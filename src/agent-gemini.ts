import { config } from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import invariant from "tiny-invariant";
import { z } from "zod";
import Alpaca from "@alpacahq/alpaca-trade-api";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables from .env file
config();

// Parse model first to help determine profile name
const modelName = process.env.MODEL || "gemini-2.5-flash";

// Get profile name for file isolation
const getProfileName = (): string => {
  if (process.env.PROFILE_NAME) {
    return process.env.PROFILE_NAME;
  }
  
  // Auto-detect from model
  if (modelName.includes('gemini')) {
    return 'gemini';
  }
  
  return 'default';
};

const profileName = getProfileName();

console.log(`📁 Using profile: ${profileName} (model: ${modelName})`);

// Validate required environment variables
invariant(process.env.GEMINI_API_KEY, "GEMINI_API_KEY is not set for Gemini model");
invariant(process.env.ALPACA_API_KEY, "ALPACA_API_KEY is not set");
invariant(process.env.ALPACA_SECRET_KEY, "ALPACA_SECRET_KEY is not set");

// Create native Gemini client
const createNativeGeminiClient = () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
};

// Initialize Alpaca client for paper trading
const alpaca = new Alpaca({
  key: process.env.ALPACA_API_KEY!,
  secret: process.env.ALPACA_SECRET_KEY!,
  paper: true,
  usePolygon: false,
});

console.log(`🔧 Alpaca config - Base URL: ${alpaca.configuration.baseUrl}, Key ID: ${process.env.ALPACA_API_KEY?.substring(0, 8)}...`);

// Logging function with timestamp
const log = (message: string): void => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // Also append to log file
  const logPath = `results/${profileName}/agent-${profileName}.log`;
  appendFile(logPath, logMessage + '\n').catch(() => {
    // Ignore errors in logging to avoid infinite loops
  });
};

// Ensure results directory exists
const resultsDir = `results/${profileName}`;
if (!existsSync(resultsDir)) {
  mkdirSync(resultsDir, { recursive: true });
}

// Thread file path for persistence
const getThreadPath = () => `results/${profileName}/thread-${profileName}.json`;

// Load thread history from file
const loadThread = async (): Promise<any[]> => {
  const threadPath = getThreadPath();
  
  try {
    if (existsSync(threadPath)) {
      const threadData = await readFile(threadPath, 'utf-8');
      return JSON.parse(threadData);
    }
  } catch (error) {
    log(`⚠️ Could not load thread: ${error}`);
  }
  
  return [];
};

// Save thread history to file
const saveThread = async (thread: any[]): Promise<void> => {
  const threadPath = getThreadPath();
  
  try {
    await writeFile(threadPath, JSON.stringify(thread, null, 2));
    log(`💾 Saved thread history (${thread.length} items)`);
  } catch (error) {
    log(`❌ Failed to save thread: ${error}`);
  }
};

// Test Alpaca connection
const testAlpacaConnection = async (): Promise<boolean> => {
  try {
    log(`🔗 Testing Alpaca connection to: ${alpaca.configuration.baseUrl}`);
    log(`🗝️ Using API Key ID: ${process.env.ALPACA_API_KEY?.substring(0, 8)}...`);
    
    const account = await alpaca.getAccount();
    log(`✅ Alpaca connection successful - Account ID: ${account.id}`);
    return true;
  } catch (error) {
    log(`❌ Alpaca connection failed: ${error}`);
    return false;
  }
};

// Portfolio schema for type checking
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

// Get stock price using Alpaca API with Yahoo Finance fallback
const getStockPrice = async (ticker: string): Promise<number> => {
  try {
    const latestTrade = await alpaca.getLatestTrade(ticker);
    const price = latestTrade.price;
    log(`✅ Found price for ${ticker}: $${price} via Alpaca market data`);
    return price;
  } catch (error) {
    log(`⚠️ Alpaca price fetch failed for ${ticker}: ${error}`);
    
    // Fallback to Yahoo Finance if Alpaca fails
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
      const data = await response.json();
      const price = data.chart.result[0].meta.regularMarketPrice;
      log(`✅ Found price for ${ticker}: $${price} via Yahoo Finance fallback`);
      return price;
    } catch (fallbackError) {
      log(`❌ Both Alpaca and Yahoo Finance failed for ${ticker}: ${fallbackError}`);
      throw new Error(`Could not fetch price for ${ticker}`);
    }
  }
};

// Calculate net worth from Alpaca account
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

// Calculate CAGR helper function
const calculateCAGR = (days: number, currentValue: number): number => {
  const startValue = 1000;
  const years = days / 365;
  const cagr = Math.pow(currentValue / startValue, 1 / years) - 1;
  return cagr;
};

// Calculate annualized return
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

// Web search function using Brave Search API
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

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Native Gemini trading session with proper rate limiting
const runNativeGeminiTradingSession = async (): Promise<void> => {
  log("🚀 Starting Native Gemini trading session");

  try {
    const thread = await loadThread();
    const geminiModel = createNativeGeminiClient();
    const systemPrompt = await readFile("system-prompt.md", "utf-8");

    // Convert thread to native Gemini format
    const history = [];

    // Convert existing thread to Gemini format
    for (const item of thread) {
      if (item.role === "user") {
        history.push({
          role: "user",
          parts: [{ text: typeof item.content === 'string' ? item.content : JSON.stringify(item.content) }]
        });
      } else if (item.role === "assistant") {
        history.push({
          role: "model", 
          parts: [{ text: typeof item.content === 'string' ? item.content : JSON.stringify(item.content) }]
        });
      }
    }

    // Start chat with history (no system instruction for now)
    const chat = geminiModel.startChat({
      history,
    });

    // Define available tools
    const tools = [
      {
        name: "think",
        description: "Think about a trading strategy with step-by-step reasoning",
        parameters: {
          type: "object",
          properties: {
            thought_process: {
              type: "array",
              items: { type: "string" },
              description: "Array of thoughts for step-by-step reasoning"
            }
          },
          required: ["thought_process"]
        }
      },
      {
        name: "get_stock_price",
        description: "Get the current price of a stock ticker",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
            }
          },
          required: ["ticker"]
        }
      },
      {
        name: "get_portfolio",
        description: "Get your current portfolio holdings and trading history",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "get_net_worth",
        description: "Get your current net worth (total portfolio value)",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "web_search",
        description: "Search the web for information",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for web search"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "buy",
        description: "Buy a given stock at the current market price using Alpaca paper trading",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
            },
            shares: {
              type: "number",
              description: "Number of shares to buy (must be positive)"
            }
          },
          required: ["ticker", "shares"]
        }
      },
      {
        name: "sell",
        description: "Sell a given stock at the current market price using Alpaca paper trading",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
            },
            shares: {
              type: "number",
              description: "Number of shares to sell (must be positive)"
            }
          },
          required: ["ticker", "shares"]
        }
      },
      {
        name: "short_sell",
        description: "Short sell a stock by selling shares you don't own, betting the price will decrease. Warning: Short positions have unlimited loss potential.",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
            },
            shares: {
              type: "number",
              description: "Number of shares to short sell (must be positive)"
            }
          },
          required: ["ticker", "shares"]
        }
      },
      {
        name: "cover_short",
        description: "Cover (close) a short position by buying back shares to close the short sale",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
            },
            shares: {
              type: "number",
              description: "Number of shares to cover (must be positive)"
            }
          },
          required: ["ticker", "shares"]
        }
      }
    ];

    const currentPrompt = `You are an AI trading agent. Your goal is to analyze the market and make trading decisions to grow a $1,000 investment.
    
    It's ${new Date().toLocaleString("en-US")}. Time for your trading analysis! Review your portfolio, scan the markets for opportunities, and make strategic trades to grow your initial $1,000 investment.
    
    You have access to the following tools:
    - think: Use this to think through your trading strategy step by step
    - get_stock_price: Get the current price of any stock ticker
    - get_portfolio: Get your current portfolio holdings and trading history
    - get_net_worth: Get your current net worth (total portfolio value)
    - web_search: Search the web for information
    - buy: Buy a given stock at the current market price using Alpaca paper trading
    - sell: Sell a given stock at the current market price using Alpaca paper trading
    - short_sell: Short sell a stock by selling shares you don't own, betting the price will decrease (WARNING: unlimited loss potential)
    - cover_short: Cover (close) a short position by buying back shares to close the short sale
    
    Please start by using the 'think' tool to analyze the current market conditions, then use get_portfolio and get_net_worth to check your holdings. Good luck! 📈`;

    log(`🔄 Sending message to Gemini with tools`);
    
    // Add longer delay to prevent rate limiting
    await sleep(2000);
    
    try {
      // Send message with function calling enabled
      const result = await chat.sendMessage(currentPrompt, {
        tools: [{
          functionDeclarations: tools
        }]
      });
      
      const response = result.response;
      const text = response.text();
      
      // Check if function calls were made
      if (response.functionCalls()) {
        log(`🔧 Processing ${response.functionCalls().length} function calls`);
        
        const functionCalls = response.functionCalls();
        let functionResults = [];
        
        for (const functionCall of functionCalls) {
          const { name, args } = functionCall;
          log(`🛠️ Executing function: ${name}`);
          
          let functionResult: string;
          
          try {
            switch (name) {
              case "think":
                const thoughts = args.thought_process || [];
                thoughts.forEach((thought: string) => log(`🧠 ${thought}`));
                functionResult = `Completed thinking with ${thoughts.length} steps of reasoning.`;
                break;
              case "get_stock_price":
                const ticker = args.ticker;
                const price = await getStockPrice(ticker);
                log(`🔖 Searched for stock price for ${ticker}: $${price}`);
                functionResult = price.toString();
                break;
              case "get_portfolio":
                const portfolio = await getPortfolio();
                log(`💹 Fetched portfolio: $${portfolio.cash}`);
                functionResult = `Your cash balance is $${portfolio.cash}.
Current holdings:
${Object.entries(portfolio.holdings)
  .map(([ticker, shares]) => `  - ${ticker}: ${shares} shares`)
  .join("\n")}

Trade history:
${portfolio.history
  .map(
    (trade) =>
      `  - ${trade.date} ${trade.type} ${trade.ticker} ${trade.shares} shares at $${trade.price} per share, for a total of $${trade.total}`
  )
  .join("\n")}`;
                break;
              case "get_net_worth":
                const netWorth = await calculateNetWorth();
                const portfolioForReturn = await getPortfolio();
                const annualizedReturn = await calculateAnnualizedReturn(portfolioForReturn);
                log(`💰 Current net worth: $${netWorth} (${annualizedReturn}% annualized return)`);
                functionResult = `Your current net worth is $${netWorth}
- Cash: $${portfolioForReturn.cash}
- Holdings value: $${(netWorth - portfolioForReturn.cash).toFixed(2)}
- Annualized return: ${annualizedReturn}% (started with $1,000)
- ${netWorth >= 1000 ? "📈 Up" : "📉 Down"} $${Math.abs(netWorth - 1000).toFixed(2)} from initial investment`;
                break;
              case "web_search":
                const query = args.query;
                log(`🔍 Searching the web for: ${query}`);
                functionResult = await webSearch(query);
                break;
              case "buy":
                const buyTicker = args.ticker;
                const buyShares = args.shares;
                try {
                  const account = await getAlpacaAccount();
                  const price = await getStockPrice(buyTicker);
                  const orderValue = buyShares * price;

                  // Check if we have enough buying power
                  if (parseFloat(account.buying_power) < orderValue) {
                    functionResult = `You don't have enough buying power to buy ${buyShares} shares of ${buyTicker}. Your buying power is $${account.buying_power} and the estimated cost is $${orderValue.toFixed(2)}.`;
                    break;
                  }

                  // Create market buy order through Alpaca
                  const order = await alpaca.createOrder({
                    symbol: buyTicker,
                    qty: buyShares,
                    side: 'buy',
                    type: 'market',
                    time_in_force: 'gtc'
                  });

                  log(`💰 Submitted buy order for ${buyShares} shares of ${buyTicker} (Order ID: ${order.id})`);
                  
                  // Return confirmation with order details
                  functionResult = `Submitted buy order for ${buyShares} shares of ${buyTicker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated cost: $${orderValue.toFixed(2)}.`;
                } catch (error) {
                  log(`❌ Failed to buy ${buyShares} shares of ${buyTicker}: ${error}`);
                  functionResult = `Failed to place buy order for ${buyShares} shares of ${buyTicker}. Error: ${error}`;
                }
                break;
              case "sell":
                const sellTicker = args.ticker;
                const sellShares = args.shares;
                try {
                  const positions = await getAlpacaPositions();
                  const position = positions.find(p => p.symbol === sellTicker);
                  
                  if (!position || parseFloat(position.qty) < sellShares) {
                    const currentShares = position ? parseFloat(position.qty) : 0;
                    functionResult = `You don't have enough shares of ${sellTicker} to sell. You have ${currentShares} shares.`;
                    break;
                  }

                  const price = await getStockPrice(sellTicker);
                  const orderValue = sellShares * price;

                  // Create market sell order through Alpaca
                  const order = await alpaca.createOrder({
                    symbol: sellTicker,
                    qty: sellShares,
                    side: 'sell',
                    type: 'market',
                    time_in_force: 'gtc'
                  });

                  log(`💸 Submitted sell order for ${sellShares} shares of ${sellTicker} (Order ID: ${order.id})`);
                  
                  // Return confirmation with order details
                  functionResult = `Submitted sell order for ${sellShares} shares of ${sellTicker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated proceeds: $${orderValue.toFixed(2)}.`;
                } catch (error) {
                  log(`❌ Failed to sell ${sellShares} shares of ${sellTicker}: ${error}`);
                  functionResult = `Failed to place sell order for ${sellShares} shares of ${sellTicker}. Error: ${error}`;
                }
                break;
              case "short_sell":
                const shortTicker = args.ticker;
                const shortShares = args.shares;
                try {
                  // Check account equity for short selling requirements
                  const account = await getAlpacaAccount();
                  const accountEquity = parseFloat(account.portfolio_value);
                  const buyingPower = parseFloat(account.buying_power);
                  
                  // Alpaca requires $40,000 minimum account equity for short selling
                  if (accountEquity < 40000) {
                    functionResult = `Account equity of $${accountEquity.toFixed(2)} is below the $40,000 minimum required for short selling on Alpaca.`;
                    break;
                  }
                  
                  const price = await getStockPrice(shortTicker);
                  const orderValue = shortShares * price;
                  
                  // Basic check - ensure sufficient buying power for short position
                  if (buyingPower < orderValue * 0.5) { // 50% margin requirement approximation
                    functionResult = `Insufficient buying power for short position. Need ~$${(orderValue * 0.5).toFixed(2)} but have $${buyingPower.toFixed(2)} buying power.`;
                    break;
                  }

                  // Create market sell order (short sell) through Alpaca
                  const order = await alpaca.createOrder({
                    symbol: shortTicker,
                    qty: shortShares,
                    side: 'sell',
                    type: 'market',
                    time_in_force: 'gtc'
                  });

                  log(`📉 Submitted SHORT SELL order for ${shortShares} shares of ${shortTicker} (Order ID: ${order.id})`);
                  
                  // Return confirmation with order details
                  functionResult = `Submitted SHORT SELL order for ${shortShares} shares of ${shortTicker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated proceeds: $${orderValue.toFixed(2)}. WARNING: This is a short position with unlimited loss potential.`;
                } catch (error) {
                  log(`❌ Failed to short sell ${shortShares} shares of ${shortTicker}: ${error}`);
                  functionResult = `Failed to place short sell order for ${shortShares} shares of ${shortTicker}. Error: ${error}`;
                }
                break;
              case "cover_short":
                const coverTicker = args.ticker;
                const coverShares = args.shares;
                try {
                  const positions = await getAlpacaPositions();
                  const position = positions.find(p => p.symbol === coverTicker);
                  
                  // Check if we have a short position (negative quantity)
                  if (!position || parseFloat(position.qty) >= 0) {
                    const currentShares = position ? parseFloat(position.qty) : 0;
                    functionResult = `No short position found for ${coverTicker}. Current position: ${currentShares} shares (positive = long, negative = short).`;
                    break;
                  }
                  
                  const shortPosition = Math.abs(parseFloat(position.qty));
                  if (coverShares > shortPosition) {
                    functionResult = `Cannot cover ${coverShares} shares - you only have ${shortPosition} shares short in ${coverTicker}.`;
                    break;
                  }

                  const price = await getStockPrice(coverTicker);
                  const orderValue = coverShares * price;

                  // Create market buy order to cover short position
                  const order = await alpaca.createOrder({
                    symbol: coverTicker,
                    qty: coverShares,
                    side: 'buy',
                    type: 'market',
                    time_in_force: 'gtc'
                  });

                  log(`📈 Submitted BUY TO COVER order for ${coverShares} shares of ${coverTicker} (Order ID: ${order.id})`);
                  
                  // Return confirmation with order details
                  functionResult = `Submitted BUY TO COVER order for ${coverShares} shares of ${coverTicker} at market price. Order ID: ${order.id}. Status: ${order.status}. Estimated cost: $${orderValue.toFixed(2)}.`;
                } catch (error) {
                  log(`❌ Failed to cover short position for ${coverShares} shares of ${coverTicker}: ${error}`);
                  functionResult = `Failed to place cover order for ${coverShares} shares of ${coverTicker}. Error: ${error}`;
                }
                break;
              default:
                functionResult = `Unknown function: ${name}`;
                log(`❌ Unknown function requested: ${name}`);
            }
            log(`✅ Function ${name} executed successfully`);
          } catch (error) {
            functionResult = `Function execution failed: ${error}`;
            log(`❌ Function ${name} failed: ${error}`);
          }
          
          functionResults.push({
            name,
            response: functionResult
          });
        }
        
        // Send function results back to continue conversation
        const followUpResult = await chat.sendMessage(functionResults);
        const followUpResponse = followUpResult.response;
        const finalText = followUpResponse.text();
        
        if (finalText) {
          log(`🤖 Gemini final response: ${finalText}`);
        }
        
        log(`✅ Native Gemini trading session completed with tools: ${finalText}`);
        
        // Save conversation including function calls
        const newThread = [
          ...thread,
          { role: "user", content: currentPrompt },
          { role: "assistant", content: `${text || 'Function calls made'} -> ${finalText}` }
        ];
        
        await saveThread(newThread);
        
      } else {
        // No function calls, handle as before
        if (text) {
          log(`🤖 Gemini response: ${text}`);
        }
        
        log(`✅ Native Gemini trading session completed: ${text}`);
        
        // Save simple conversation to thread
        const newThread = [
          ...thread,
          { role: "user", content: currentPrompt },
          { role: "assistant", content: text }
        ];
        
        await saveThread(newThread);
      }
      
    } catch (error) {
      log(`❌ Native Gemini API call failed: ${error}`);
      throw error;
    }
    
  } catch (error) {
    log(`❌ Native Gemini trading session failed: ${error}`);
    throw error;
  }
};

// Market hours detection
const isMarketOpen = (): boolean => {
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

// Main execution
const main = async (): Promise<void> => {
  // Test Alpaca connection before starting trading
  const alpacaConnected = await testAlpacaConnection();
  if (!alpacaConnected) {
    log(`⚠️ Trading session continuing despite Alpaca connection issues`);
  }

  const continuous = process.argv.includes('--continuous');
  
  if (continuous) {
    log(`🔄 Continuous mode not implemented yet for native Gemini`);
    log(`🎯 Running single session instead`);
  } else {
    log(`🎯 Single session mode`);
  }

  // Check market status
  const marketOpen = isMarketOpen();
  log(`📈 Markets are currently ${marketOpen ? 'OPEN' : 'CLOSED'}`);

  try {
    await runNativeGeminiTradingSession();
    log(`✅ Session completed successfully`);
  } catch (error) {
    log(`❌ Session failed: ${error}`);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  log("🛑 Received shutdown signal. Exiting gracefully...");
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  log(`❌ Unexpected error: ${error}`);
  process.exit(1);
});