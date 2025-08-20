# AI Trading Agent - DEFAULT Profile

An autonomous AI-powered stock trading agent using **gpt-5** that executes trades automatically via Alpaca's paper trading API.

## Overview

This trading agent (default profile) starts with virtual capital and attempts to grow the portfolio through strategic trading decisions. All trades are executed on Alpaca's paper trading platform using real market data.

<!-- auto start -->

## 💰 Portfolio value: $49,001.46** (∞% CAGR)

### 📊 Holdings

| Asset | Shares | Value |
|-------|--------|-------|
| Cash | - | $961.16 |
| AVGO | 39 | $11372.40 |
| NVDA | 68 | $11919.72 |
| QQQ | 27 | $15289.02 |
| SPY | 4 | $2553.36 |
| TLT | 40 | $3473.60 |
| XLE | 40 | $3432.20 |

### 📈 Recent trades

- **August 20, 2025 at 7:56:25 PM**: SELL 5 QQQ @ $566.248/share ($2831.24) 📈 **P&L: +$5.03 (+0.18%)**
- **August 20, 2025 at 7:56:25 PM**: BUY 4 SPY @ $638.38/share ($2553.52)
- **August 20, 2025 at 6:52:37 PM**: SELL 20 TLT @ $86.71/share ($1734.20) 📉 **P&L: $-0.63 (-0.04%)**
- **August 20, 2025 at 6:52:36 PM**: BUY 20 NVDA @ $173.74/share ($3474.80)
- **August 20, 2025 at 6:52:36 PM**: BUY 3 QQQ @ $564.536667/share ($1693.61)
- **August 20, 2025 at 6:52:36 PM**: SELL 20 XLE @ $86.02/share ($1720.40) 📈 **P&L: +$5.61 (+0.33%)**
- **August 20, 2025 at 6:51:31 PM**: BUY 20 AVGO @ $288.98/share ($5779.60)
- **August 20, 2025 at 6:51:28 PM**: BUY 25 NVDA @ $173.76/share ($4344.00)
- **August 20, 2025 at 6:51:26 PM**: BUY 20 QQQ @ $564.66/share ($11293.20)
- **August 20, 2025 at 6:51:23 PM**: SELL 10 AMZN @ $223.734/share ($2237.34) 📉 **P&L: $-38.16 (-1.68%)**

<!-- auto end -->

## Features

- 🤖 Autonomous trading using gpt-5
- 📊 Real-time market data and analysis
- 💰 Paper trading through Alpaca API
- 📈 Automated portfolio tracking and reporting
- 🧠 Strategic decision-making with risk management

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env.default`
4. Run the agent: `dotenv -e .env.default npm start`

## Trading Strategy

The agent follows a momentum-based trading strategy, focusing on:
- Technical analysis and market trends
- News-driven opportunities
- Risk management and diversification
- Continuous learning from trading results
