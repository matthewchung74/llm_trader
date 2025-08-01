import { TradingService } from './trading.js';
import Table from 'cli-table3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { config } from "dotenv";
import Alpaca from "@alpacahq/alpaca-trade-api";
import OpenAI from "openai";
import invariant from "tiny-invariant";

// Load environment variables
config();

invariant(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is not set");
invariant(process.env.ALPACA_API_KEY, "ALPACA_API_KEY is not set");
invariant(process.env.ALPACA_SECRET_KEY, "ALPACA_SECRET_KEY is not set");

class TradingDashboard {
  private tradingService: TradingService;

  constructor() {
    // Initialize Alpaca client
    const alpaca = new Alpaca({
      keyId: process.env.ALPACA_API_KEY!,
      secretKey: process.env.ALPACA_SECRET_KEY!,
      paper: true,
      baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
    });

    // Initialize OpenAI client
    const openaiClient = new OpenAI();

    // Simple logger function
    const logger = (message: string) => {
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}] ${message}`));
    };

    this.tradingService = new TradingService(alpaca, openaiClient, logger);
  }

  async displayPortfolioSummary() {
    console.clear();
    console.log(chalk.bold.blue('🏦 TRADING PORTFOLIO DASHBOARD 🏦\n'));

    try {
      const [portfolio, netWorth] = await Promise.all([
        this.tradingService.getPortfolio(),
        this.tradingService.calculateNetWorth()
      ]);

      // Portfolio Summary Table
      const summaryTable = new Table({
        head: [chalk.cyan('Metric'), chalk.cyan('Value')],
        colWidths: [20, 20]
      });

      const initialInvestment = 100000; // Alpaca paper trading starts with $100k
      const totalReturn = netWorth - initialInvestment;
      const returnPercentage = ((netWorth / initialInvestment) - 1) * 100;

      summaryTable.push(
        ['Cash Balance', chalk.green(`$${portfolio.cash.toLocaleString()}`)],
        ['Net Worth', chalk.bold.green(`$${netWorth.toLocaleString()}`)],
        ['Total Return', totalReturn >= 0 ? chalk.green(`+$${totalReturn.toLocaleString()}`) : chalk.red(`-$${Math.abs(totalReturn).toLocaleString()}`)],
        ['Return %', returnPercentage >= 0 ? chalk.green(`+${returnPercentage.toFixed(2)}%`) : chalk.red(`${returnPercentage.toFixed(2)}%`)],
        ['Positions', Object.keys(portfolio.holdings).length.toString()]
      );

      console.log(summaryTable.toString());

      // Holdings Table
      if (Object.keys(portfolio.holdings).length > 0) {
        console.log(chalk.bold.yellow('\n📈 CURRENT HOLDINGS\n'));
        
        const holdingsTable = new Table({
          head: [chalk.cyan('Symbol'), chalk.cyan('Shares'), chalk.cyan('Current Price'), chalk.cyan('Market Value')],
          colWidths: [12, 12, 15, 15]
        });

        for (const [symbol, shares] of Object.entries(portfolio.holdings)) {
          if (shares > 0) {
            try {
              const price = await this.tradingService.getStockPrice(symbol);
              const marketValue = shares * price;
              
              holdingsTable.push([
                chalk.white(symbol),
                shares.toString(),
                chalk.green(`$${price.toFixed(2)}`),
                chalk.bold.green(`$${marketValue.toLocaleString()}`)
              ]);
            } catch (error) {
              holdingsTable.push([
                chalk.white(symbol),
                shares.toString(),
                chalk.red('Error'),
                chalk.red('Error')
              ]);
            }
          }
        }

        console.log(holdingsTable.toString());
      }

      // Recent Trades Table
      if (portfolio.history.length > 0) {
        console.log(chalk.bold.yellow('\n📊 RECENT TRADES (Last 10)\n'));
        
        const tradesTable = new Table({
          head: [chalk.cyan('Date'), chalk.cyan('Action'), chalk.cyan('Symbol'), chalk.cyan('Shares'), chalk.cyan('Price'), chalk.cyan('Total')],
          colWidths: [20, 8, 8, 8, 10, 12]
        });

        const recentTrades = portfolio.history.slice(-10).reverse();
        
        for (const trade of recentTrades) {
          const date = new Date(trade.date).toLocaleDateString();
          const actionColor = trade.type === 'buy' ? chalk.green : chalk.red;
          const actionText = trade.type.toUpperCase();
          
          tradesTable.push([
            chalk.gray(date),
            actionColor(actionText),
            chalk.white(trade.ticker),
            trade.shares.toString(),
            `$${trade.price.toFixed(2)}`,
            `$${trade.total.toLocaleString()}`
          ]);
        }

        console.log(tradesTable.toString());
      }

    } catch (error) {
      console.error(chalk.red('Error loading portfolio data:'), error);
    }
  }

  async displayMenu() {
    const choices = [
      { name: '📊 View Portfolio Summary', value: 'portfolio' },
      { name: '🔍 Get Stock Price', value: 'price' },
      { name: '🌐 Web Search', value: 'search' },
      { name: '💰 Buy Stock', value: 'buy' },
      { name: '💸 Sell Stock', value: 'sell' },
      { name: '🔄 Refresh Dashboard', value: 'refresh' },
      { name: '❌ Exit', value: 'exit' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    return action;
  }

  async handleStockPrice() {
    const { ticker } = await inquirer.prompt([
      {
        type: 'input',
        name: 'ticker',
        message: 'Enter stock ticker symbol:',
        validate: (input) => input.trim().length > 0 || 'Please enter a valid ticker'
      }
    ]);

    try {
      console.log(chalk.yellow(`\n🔍 Fetching price for ${ticker.toUpperCase()}...`));
      const price = await this.tradingService.getStockPrice(ticker.toUpperCase());
      console.log(chalk.green(`💰 ${ticker.toUpperCase()}: $${price.toFixed(2)}\n`));
    } catch (error) {
      console.error(chalk.red(`❌ Error fetching price for ${ticker}: ${error}\n`));
    }

    await this.waitForKeyPress();
  }

  async handleWebSearch() {
    const { query } = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: 'Enter search query:',
        validate: (input) => input.trim().length > 0 || 'Please enter a search query'
      }
    ]);

    try {
      console.log(chalk.yellow(`\n🌐 Searching for: ${query}...`));
      const result = await this.tradingService.webSearch(query);
      console.log(chalk.blue('\n📖 Search Results:'));
      console.log(chalk.white(result));
      console.log();
    } catch (error) {
      console.error(chalk.red(`❌ Search error: ${error}\n`));
    }

    await this.waitForKeyPress();
  }

  async handleBuyStock() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'ticker',
        message: 'Enter stock ticker to buy:',
        validate: (input) => input.trim().length > 0 || 'Please enter a valid ticker'
      },
      {
        type: 'number',
        name: 'shares',
        message: 'Enter number of shares:',
        validate: (input) => input > 0 || 'Please enter a positive number of shares'
      }
    ]);

    try {
      console.log(chalk.yellow(`\n💰 Buying ${answers.shares} shares of ${answers.ticker.toUpperCase()}...`));
      const result = await this.tradingService.buyStock(answers.ticker.toUpperCase(), answers.shares);
      console.log(chalk.green(`✅ ${result}\n`));
    } catch (error) {
      console.error(chalk.red(`❌ Buy order error: ${error}\n`));
    }

    await this.waitForKeyPress();
  }

  async handleSellStock() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'ticker',
        message: 'Enter stock ticker to sell:',
        validate: (input) => input.trim().length > 0 || 'Please enter a valid ticker'
      },
      {
        type: 'number',
        name: 'shares',
        message: 'Enter number of shares:',
        validate: (input) => input > 0 || 'Please enter a positive number of shares'
      }
    ]);

    try {
      console.log(chalk.yellow(`\n💸 Selling ${answers.shares} shares of ${answers.ticker.toUpperCase()}...`));
      const result = await this.tradingService.sellStock(answers.ticker.toUpperCase(), answers.shares);
      console.log(chalk.green(`✅ ${result}\n`));
    } catch (error) {
      console.error(chalk.red(`❌ Sell order error: ${error}\n`));
    }

    await this.waitForKeyPress();
  }

  async waitForKeyPress() {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }

  async run() {
    while (true) {
      await this.displayPortfolioSummary();
      const action = await this.displayMenu();

      switch (action) {
        case 'portfolio':
          await this.displayPortfolioSummary();
          await this.waitForKeyPress();
          break;
        case 'price':
          await this.handleStockPrice();
          break;
        case 'search':
          await this.handleWebSearch();
          break;
        case 'buy':
          await this.handleBuyStock();
          break;
        case 'sell':
          await this.handleSellStock();
          break;
        case 'refresh':
          // Just loop back to refresh the display
          break;
        case 'exit':
          console.log(chalk.green('\n👋 Thanks for using the Trading Dashboard!\n'));
          process.exit(0);
        default:
          console.log(chalk.red('Invalid option selected'));
      }
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new TradingDashboard();
  dashboard.run().catch(console.error);
}