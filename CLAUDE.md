# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an autonomous AI-powered stock trading agent built with OpenAI's Agents framework. The agent executes trades automatically via GitHub Actions, starting with $1,000 and attempting to grow the portfolio through strategic trading decisions.

## Key Commands

### Development
- `npm start` - Run the trading agent locally (executes one trading session)
- `npm run start:continuous` - Run the agent continuously (every 30 minutes by default)
- `npm run start:continuous:1h` - Run continuously every hour
- `npm run start:continuous:4h` - Run continuously every 4 hours
- `npm install` - Install dependencies
- `tsx src/agent.ts` - Direct execution of the agent (single session)
- `tsx src/agent.ts --continuous --interval=2` - Run continuously every 2 hours

### Testing
- `npm test` - Run all tests
- `npm run test:agents` - Test agent functionality for GPT-4o and Gemini
- `npm run test:agents:verbose` - Run agent tests with verbose output
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ci` - Run tests for CI environment

### Model Selection
The agent supports flexible AI model selection via environment variables:

**OpenAI Models:**
- `MODEL=gpt-4o npm start` - GPT-4o (default, highest quality)
- `MODEL=gpt-4o-mini npm start` - GPT-4o-mini (faster, cheaper)
- `MODEL=gpt-4.1 npm start` - GPT-4.1 (if available)

**Gemini Models (experimental):**
- `MODEL=gemini-2.0-flash npm start` - Google Gemini 2.0 Flash
- `MODEL=gemini-2.5-pro npm start` - Google Gemini 2.5 Pro (requires GEMINI_API_KEY)

**Claude Models (experimental):**
- `MODEL=claude-3-5-sonnet npm start` - Anthropic Claude 3.5 Sonnet (requires ANTHROPIC_API_KEY)

**Examples:**
```bash
# Use cheaper OpenAI model for cost savings
MODEL=gpt-4o-mini npm run start:continuous

# Test single session with Gemini
MODEL=gemini-2.0-flash npm start

# Run continuous with default model
npm run start:continuous
```

**Note:** Non-OpenAI models have limited compatibility with the OpenAI Agents SDK. OpenAI models are recommended for production use.

### Multi-LLM Trading Setup
Run multiple AI models simultaneously with separate Alpaca paper trading accounts for head-to-head performance comparison:

**Available Profiles:**
- **GPT-4o Profile** (`.env.gpt4o`) - OpenAI's flagship model
- **Claude Profile** (`.env.claude`) - Anthropic's Claude 3.5 Sonnet  
- **Gemini Profile** (`.env.gemini`) - Google's Gemini 2.0 Flash

**Setup Steps:**
1. **Create Multiple Alpaca Paper Trading Accounts:**
   - Go to [Alpaca Markets](https://app.alpaca.markets/paper/dashboard/overview)
   - Create separate paper trading accounts for each AI model you want to run
   - Each account starts with $100,000 virtual capital
   - Note the API keys for each account

2. **Configure Profile Environment Files:**
   - **GPT-4o**: Configure `.env.gpt4o` with first Alpaca account + OpenAI API key
   - **Claude**: Configure `.env.claude` with second Alpaca account + Anthropic API key  
   - **Gemini**: Configure `.env.gemini` with third Alpaca account + Gemini API key
   - Each profile gets completely isolated data files and trading accounts

**Running Multiple Profiles:**
```bash
# 3-Way AI Trading Competition
# Terminal 1: GPT-4o trader
MODEL=gpt-4o PROFILE_NAME=gpt4o npm run start:continuous

# Terminal 2: Claude trader  
MODEL=claude-3-5-sonnet PROFILE_NAME=claude npm run start:continuous

# Terminal 3: Gemini trader
MODEL=gemini-2.5-flash PROFILE_NAME=gemini npm run start:continuous

# Single sessions for testing
MODEL=gpt-4o PROFILE_NAME=gpt4o npm start
MODEL=claude-3-5-sonnet PROFILE_NAME=claude npm start  
MODEL=gemini-2.5-flash PROFILE_NAME=gemini npm start

# Alternative: Using dotenv-cli with explicit .env files (may require removing main .env file)
# dotenv -f .env.gpt4o -- npm start
# dotenv -f .env.claude -- npm start  
# dotenv -f .env.gemini -- npm start
```

**Profile Isolation & Performance Tracking:**
- **Separate Data Files:** Each AI gets its own `thread-{profile}.json`, `README-{profile}.md`, `agent-{profile}.log`
- **Individual Dashboards:** `README-gpt4o.md`, `README-claude.md`, `README-gemini.md`
- **Separate CSV Reports:** `pnl_gpt-4o_{date}.csv`, `pnl_claude-3-5-sonnet_{date}.csv`, `pnl_gemini-2.0-flash_{date}.csv`
- **Separate Alpaca Accounts:** Complete account and P&L isolation ($100k each)
- **Can Run Simultaneously:** No file conflicts or shared state
- **Real-Time Comparison:** Compare performance across all models simultaneously

**Prerequisites:**
Install dotenv-cli if not already installed:
```bash
npm install -g dotenv-cli
```

**AI Model Comparison Use Cases:**
- **Performance Benchmarking:** Which AI generates better returns?
- **Strategy Differences:** How do different models approach the same market conditions?
- **Risk Management:** Which AI handles volatility better?
- **Market Adaptation:** How quickly does each AI adapt to market changes?

### No Testing Framework
The project does not have tests configured. The `npm test` command will output an error message.

## Architecture

### Core Components

**agent.ts** - Main application file containing:
- Trading agent logic using OpenAI's Agents framework
- Alpaca API integration for real paper trading
- Stock price fetching via Alpaca market data API with Yahoo Finance fallback
- Trading tools (buy, sell, get_portfolio, get_net_worth, get_stock_price, web_search, think)
- Thread persistence for conversation history
- README auto-update functionality

**Data Files:**
- `thread.json` - Agent conversation history for continuity
- `agent.log` - Trading activity logs
- `system-prompt.md` - Agent instructions and trading strategy
- `.env` - Environment variables (OpenAI API key, Alpaca credentials)
- `pnl_[MODEL]_[DATE].csv` - P&L reports generated per model per day

### Key Functions

- `getStockPrice()` - Fetches current stock prices using Alpaca market data API with Yahoo Finance fallback
- `calculateNetWorth()` - Gets total portfolio value from Alpaca account
- `calculateCAGR()` - Calculates annualized returns
- `updateReadme()` - Auto-updates README with current portfolio stats
- `generateCSVReport()` - Creates P&L CSV report per model per day
- `loadThread()`/`saveThread()` - Manages conversation persistence
- `getAlpacaAccount()` - Gets Alpaca paper trading account information
- `getAlpacaPositions()` - Gets current stock positions from Alpaca
- `getAlpacaOrderHistory()` - Gets trading history from Alpaca

### Agent Tools

The trading agent has access to these tools:
- `think` - Step-by-step reasoning (required before other tools)
- `get_portfolio` - View current holdings and trade history from Alpaca
- `get_net_worth` - Check total portfolio value from Alpaca account
- `get_stock_price` - Get current price for any ticker via Alpaca/Yahoo Finance
- `buy`/`sell` - Execute real trades via Alpaca paper trading API
- `web_search` - Research market conditions and news

### Portfolio Schema

Portfolio data is now sourced from Alpaca paper trading account:
```typescript
{
  cash: number, // From Alpaca account.cash
  holdings: Record<string, number>, // From Alpaca positions
  history: Array<{ // From Alpaca order history
    date: string,
    type: "buy" | "sell",
    ticker: string,
    shares: number,
    price: number,
    total: number
  }>
}
```

## Reporting Features

### CSV P&L Reports
- **Automatic Generation**: CSV reports are generated after each trading session
- **Per-Model Tracking**: Each AI model generates separate CSV files for performance comparison
- **File Format**: `pnl_[MODEL]_[DATE].csv` (e.g., `pnl_gpt-4o-mini_2025-07-31.csv`)
- **Contents**: Date, Type, Ticker, Shares, Price, Total, Model, P&L, P&L_Percent, Cache_Enabled, Cache_TTL
- **Use Cases**: Compare model performance, track trading strategies, analyze P&L patterns

### README Auto-Update
- **Live Portfolio**: README.md shows current portfolio value and holdings
- **Recent Trades**: Last 10 trades with P&L calculations
- **Performance Metrics**: CAGR and total returns from initial investment
- **Auto-Refresh**: Updates after every successful trading session

## AI Model Caching

The trading agent implements advanced caching to reduce costs and improve response times:

### OpenAI Automatic Caching
- **Automatic Activation**: Enabled by default for all OpenAI models (GPT-4o, GPT-4o-mini, o1-preview, o1-mini)
- **Cost Savings**: 50% discount on cached tokens (prompts >1,024 tokens)
- **Performance**: Faster response times for repeated system prompts
- **Monitoring**: Cache hit information logged in trading sessions
- **No Configuration**: Works automatically, no setup required

### Gemini Explicit Caching
- **Dual Caching**: Both implicit (automatic) and explicit (configurable) caching
- **Implicit Caching**: 75% cost discount on Gemini 2.5 models (automatic)
- **Explicit Caching**: System prompt cached with customizable TTL (Time To Live)
- **Configuration**: Set `CACHE_TTL_SECONDS` (default: 3600s/1 hour) and `ENABLE_EXPLICIT_CACHING`
- **Smart Management**: Automatic cache creation, reuse, and expiry handling

### Caching Configuration
```bash
# Cache TTL for Gemini explicit caching (seconds)
CACHE_TTL_SECONDS=3600

# Enable/disable explicit caching for Gemini
ENABLE_EXPLICIT_CACHING=true
```

### Benefits for Trading
- **Lower Costs**: 50-75% savings on system prompt processing
- **Faster Decisions**: Reduced latency for time-sensitive trades
- **Consistent Strategy**: Same cached system prompt ensures uniform trading rules
- **Better ROI**: Cost savings mean more budget available for actual trading

### Monitoring
- Cache statistics logged after each trading session
- CSV reports include cache configuration information
- Hit rates and cost savings displayed in logs

## Important Notes

- The agent requires `OPENAI_API_KEY` environment variable
- The agent requires `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` for paper trading
- All trades are executed on Alpaca's paper trading platform (no real money)
- Stock prices fetched via Alpaca market data API with Yahoo Finance fallback
- Agent runs automatically every 30 minutes during market hours
- Paper trading account starts with $100,000 virtual cash
- README is auto-updated after each trading session with current portfolio value
- CSV P&L reports are generated per model for performance tracking
- Agent must use `think` tool before making any decisions (mandatory thinking process)
- Thread history is persisted across runs for conversation continuity
- Orders are submitted as market orders and filled according to Alpaca's simulation engine