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

## Trading Strategy

The agent follows a momentum-based trading strategy, focusing on:
- Technical analysis and market trends
- News-driven opportunities
- Risk management and diversification
- Continuous learning from trading results
