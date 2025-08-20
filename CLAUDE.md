# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an autonomous AI-powered stock trading agent built with OpenAI's Agents framework. The agent executes trades automatically using Alpaca's paper trading API, starting with $100,000 virtual capital and attempting to grow the portfolio through strategic trading decisions.

## Key Commands

### Development
- `npm start` - Run the trading agent locally (executes one trading session)
- `npm run start:continuous` - Run the agent continuously (every 30 minutes by default)
- `npm run start:continuous:1h` - Run continuously every hour
- `npm run start:continuous:4h` - Run continuously every 4 hours
- `npm install` - Install dependencies
- `tsx src/agent.ts` - Direct execution of the agent (single session)
- `tsx src/agent.ts --continuous --interval=2` - Run continuously every 2 hours

### 🚨 Important: Running with Profile Environment Files
**RECOMMENDED APPROACH:** Use `npx dotenv -e .env.profilename` to load all API keys:
```bash
# Correct way - loads all API keys from .env.gpt5
npx dotenv -e .env.gpt5 -- npm run start:continuous
```
The dotenv approach is required because API keys are stored in the profile-specific .env files.

### Testing
- `npm test` - Run all tests with Jest framework
- `npm run test:watch` - Watch mode for development
- `npm run test:coverage` - Generate coverage reports
- See **Testing Framework** section below for comprehensive details

### Supported AI Models
**GPT-5** (OpenAI's latest flagship model, August 2025)
- Best performance for trading decisions
- Enhanced reasoning and market analysis
- Configured in `.env.gpt5`

**How to Run Trading Agents:**
```bash
# GPT-5 (OpenAI's latest model)
# Single session
npx dotenv -e .env.gpt5 -- npm start

# Continuous trading (every 30 minutes during market hours)
npx dotenv -e .env.gpt5 -- npm run start:continuous

# Continuous with different intervals
npx dotenv -e .env.gpt5 -- npm run start:continuous:1h    # Every hour
npx dotenv -e .env.gpt5 -- npm run start:continuous:4h    # Every 4 hours
```

**Note:** 
- Always use `npx dotenv -e .env.profilename` to ensure all API keys are loaded from the profile files.

### Profile-Based Trading Setup
Run the trading agent with profile-based configuration for organized data management:

**Available Profiles:**
- **GPT-5 Profile** (`.env.gpt5`) - OpenAI's latest flagship model (August 2025)

**Setup Steps:**
1. **Create Alpaca Paper Trading Account:**
   - Go to [Alpaca Markets](https://app.alpaca.markets/paper/dashboard/overview)
   - Create a paper trading account
   - Account starts with $100,000 virtual capital
   - Note the API keys for the account

2. **Configure Profile Environment File:**
   - **GPT-5**: Configure `.env.gpt5` with Alpaca account + OpenAI API key
   - Profile gets isolated data files and trading account

**Running with Profile:**
```bash
# GPT-5 trader (OpenAI's latest model)
npx dotenv -e .env.gpt5 -- npm run start:continuous

# Different time intervals
npx dotenv -e .env.gpt5 -- npm run start:continuous:1h    # Every hour
npx dotenv -e .env.gpt5 -- npm run start:continuous:4h    # Every 4 hours
```

**Profile Isolation & Performance Tracking:**
- **Separate Data Files:** Profile gets its own `thread-{profile}.json`, `README-{profile}.md`, `agent-{profile}.log`
- **Individual Dashboard:** `README-gpt5.md`
- **Separate CSV Reports:** `pnl_gpt-5_{date}.csv`
- **Dedicated Alpaca Account:** Complete account isolation ($100k)

**Prerequisites:**
Install dotenv-cli if not already installed:
```bash
npm install -g dotenv-cli
```

### Testing Framework
The project includes a comprehensive Jest-based testing suite with mock APIs for safe testing:

#### Test Commands
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode (auto-restart on changes)
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ci` - Run tests for CI environment (no watch mode)
- `npm run test:agents` - Test agent functionality end-to-end
- `npm run test:agents:verbose` - Run agent tests with detailed output
- `npm run test:trading` - Test trading service functions only
- `npm run test:all` - Run all tests sequentially

#### Test Types
1. **Agent Integration Tests** (`agents.test.ts`):
   - Real agent execution with 45-second timeout
   - Tool availability validation (think, buy, sell, short_sell, etc.)
   - API integration verification
   - Configuration and environment testing

2. **Trading Service Tests** (`trading.test.ts`):
   - Stock price fetching (Alpaca → Yahoo Finance → fallback)
   - Portfolio management (account, positions, orders)
   - Buy/sell operations with validation
   - Net worth calculations and CAGR
   - Web search functionality

3. **Unit Tests** (`trading-simple.test.ts`):
   - Core mathematical functions (CAGR calculations)
   - Schema validation for portfolio data
   - Utility function testing

#### Mock Framework
- **Safe Testing**: All tests use mock APIs - no real trading
- **Comprehensive Mocks**: Alpaca API, Yahoo Finance, OpenAI simulation
- **Realistic Data**: Proper market data for thorough testing
- **Error Simulation**: Tests failure scenarios and recovery mechanisms

#### Test Coverage
- API failures and fallback mechanisms
- Edge cases (insufficient funds, missing positions)
- Data validation and type checking
- Real agent execution in controlled environment

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
- **Automatic Activation**: Enabled by default for all OpenAI models (GPT-5, GPT-5-mini, GPT-5-nano, GPT-4o, GPT-4o-mini, o1-preview, o1-mini)
- **Cost Savings**: 50% discount on cached tokens (prompts >1,024 tokens)
- **Performance**: Faster response times for repeated system prompts
- **GPT-5 Enhanced**: GPT-5 models benefit from improved caching efficiency
- **Monitoring**: Cache hit information logged in trading sessions
- **No Configuration**: Works automatically, no setup required

### Benefits for Trading
- **Lower Costs**: 50% savings on system prompt processing
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