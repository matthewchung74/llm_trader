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

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env`
4. Run the agent: `npm start`

## Running the Agent

### Single Trading Session
```bash
npm start
```

### Continuous Trading (Market Hours Only)
```bash
# Default: Every 30 minutes during market hours
npm run start:continuous

# Custom interval (in minutes)
npm run start:continuous -- --interval=60

# Run every hour during market hours
npm run start:continuous:1h
```

### Background Operation (24/7)
```bash
# Keep running even after closing terminal
nohup npm run start:continuous > trading.log 2>&1 &

# View live logs
tail -f trading.log

# Stop background process
pkill -f "tsx src/agent.ts"
```

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
