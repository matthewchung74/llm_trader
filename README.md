# AI Trading Agent

An autonomous AI-powered stock trading agent that executes trades automatically using OpenAI's Agents framework and Alpaca's paper trading API.

## Overview

This trading agent starts with virtual capital and attempts to grow the portfolio through strategic trading decisions. All trades are executed on Alpaca's paper trading platform using real market data.

<!-- auto start -->

## 💰 Portfolio value: $0.00** (0.00% CAGR)

### 📊 Holdings

| Asset | Shares | Value |
|-------|--------|-------|
| Cash | - | $0.00 |


### 📈 Recent trades

- No trades yet

<!-- auto end -->

## Features

- 🤖 Autonomous trading using OpenAI GPT models
- 📊 Real-time market data and analysis
- 💰 Paper trading through Alpaca API
- 📈 Automated portfolio tracking and reporting
- 🧠 Strategic decision-making with risk management

## Setup

### Prerequisites
1. **Alpaca Paper Trading Account**
   - Sign up at [Alpaca Markets](https://app.alpaca.markets/paper/dashboard/overview)
   - Account starts with $100,000 virtual capital
   - Get your API keys from the dashboard

2. **OpenAI API Key**
   - Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - GPT-5 Mini recommended for best rate limits

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/matthewchung74/llm_trader.git
cd llm_trader

# Install dependencies
npm install

# Install global dependencies
npm install -g dotenv-cli tsx
```

### Environment Configuration

Create profile-based environment files:

```bash
# .env.gpt5mini (RECOMMENDED - Best rate limits)
OPENAI_API_KEY=your_openai_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# .env.gpt5 (Premium option - may hit rate limits)
OPENAI_API_KEY=your_openai_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

## Running the Agent

### 🚨 Important: Profile-Based Trading
**ALWAYS use profile-based commands** to load API keys correctly:

### Single Trading Session
```bash
# GPT-5 Mini (RECOMMENDED)
npx dotenv -e .env.gpt5mini -- npm start

# GPT-5 (Premium)
npx dotenv -e .env.gpt5 -- npm start

# Direct execution
npx dotenv -e .env.gpt5mini -- tsx src/agent.ts
```

### Continuous Trading (Market Hours Only)
```bash
# GPT-5 Mini - Every 30 minutes (RECOMMENDED)
npx dotenv -e .env.gpt5mini -- npm run start:continuous

# GPT-5 Mini - Every hour
npx dotenv -e .env.gpt5mini -- npm run start:continuous:1h

# GPT-5 Mini - Every 4 hours
npx dotenv -e .env.gpt5mini -- npm run start:continuous:4h

# GPT-5 Premium - Every 30 minutes
npx dotenv -e .env.gpt5 -- npm run start:continuous

# Custom interval (2 hours example)
npx dotenv -e .env.gpt5mini -- tsx src/agent.ts --continuous --interval=2
```

### Testing & Development
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test coverage report
npm run test:coverage

# Test agent functionality
npm run test:agents

# Test trading functions
npm run test:trading
```

### Background Operation (24/7)
```bash
# Keep running even after closing terminal
nohup npx dotenv -e .env.gpt5mini -- npm run start:continuous > trading.log 2>&1 &

# View live logs
tail -f trading.log

# Stop background process
pkill -f "tsx src/agent.ts"
```

### Market Hours Automation
The agent automatically:
- ✅ **Sleeps when markets are closed** (nights, weekends, holidays)
- ✅ **Wakes up at 9:30 AM EST** each trading day
- ✅ **Trades every 30 minutes** during market hours (9:30 AM - 4:00 PM EST)
- ✅ **Handles timezone conversion** automatically

## Docker Deployment

### Quick Start with Docker

Deploy the trading agent on any machine with Docker:

```bash
# Build and run GPT-5 Mini agent (recommended)
docker-compose --profile gpt5mini up --build

# Build and run GPT-5 agent (premium)
docker-compose --profile gpt5 up --build

# Run single trading session (for testing)
docker-compose --profile single up --build
```

### Environment Setup

Create your environment files:

```bash
# .env.gpt5mini (recommended)
OPENAI_API_KEY=your_openai_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# .env.gpt5 (premium option)
OPENAI_API_KEY=your_openai_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### Docker Features

- **Data Persistence**: Trading data and logs persist in `./results` and `./logs`
- **Auto Restart**: Container automatically restarts unless manually stopped
- **Health Checks**: Built-in monitoring of agent processes
- **Multiple Profiles**: Separate containers for different AI models

### Manual Docker Commands

```bash
# Build image
docker build -t priced-in .

# Run continuous trading
docker run -d --env-file .env.gpt5mini \
  -v $(pwd)/results:/app/results \
  -v $(pwd)/logs:/app/logs \
  --name trading-bot priced-in

# View logs
docker logs -f trading-bot

# Stop container
docker stop trading-bot
```

## Trading Strategy

The agent follows a momentum-based trading strategy, focusing on:
- Technical analysis and market trends
- News-driven opportunities
- Risk management and diversification
- Continuous learning from trading results
