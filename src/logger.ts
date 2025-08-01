import { appendFile } from "node:fs/promises";
import chalk from "chalk";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private logLevel: LogLevel;
  private logFile?: string;

  constructor(logLevel: LogLevel = LogLevel.INFO, logFile?: string) {
    this.logLevel = logLevel;
    this.logFile = logFile;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const levelText = LogLevel[entry.level].padEnd(5);
    let message = `[${timestamp}] ${levelText} ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` | Context: ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      message += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return message;
  }

  private getColorForLevel(level: LogLevel): (text: string) => string {
    switch (level) {
      case LogLevel.DEBUG:
        return chalk.gray;
      case LogLevel.INFO:
        return chalk.blue;
      case LogLevel.WARN:
        return chalk.yellow;
      case LogLevel.ERROR:
        return chalk.red;
      default:
        return chalk.white;
    }
  }

  private async writeToFile(message: string): Promise<void> {
    if (this.logFile) {
      try {
        await appendFile(this.logFile, message + "\n");
      } catch (error) {
        console.error("Failed to write to log file:", error);
      }
    }
  }

  private async log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error
    };

    const formattedMessage = this.formatMessage(entry);
    
    // Console output with colors
    const colorFn = this.getColorForLevel(level);
    console.log(colorFn(formattedMessage));
    
    // File output (plain text)
    await this.writeToFile(formattedMessage);
  }

  async debug(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.DEBUG, `🔍 ${message}`, context);
  }

  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.INFO, `ℹ️  ${message}`, context);
  }

  async warn(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.WARN, `⚠️  ${message}`, context);
  }

  async error(message: string, error?: Error, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.ERROR, `❌ ${message}`, context, error);
  }

  async trade(action: 'BUY' | 'SELL', ticker: string, shares: number, price: number, total: number): Promise<void> {
    const emoji = action === 'BUY' ? '💰' : '💸';
    await this.log(LogLevel.INFO, `${emoji} ${action} ${shares} ${ticker} @ $${price}/share = $${total.toFixed(2)}`, {
      action,
      ticker,
      shares,
      price,
      total
    });
  }

  async performance(netWorth: number, change: number, changePercent: number): Promise<void> {
    const emoji = change >= 0 ? '📈' : '📉';
    const sign = change >= 0 ? '+' : '';
    await this.log(LogLevel.INFO, `${emoji} Portfolio: $${netWorth.toLocaleString()} (${sign}$${change.toFixed(2)}, ${sign}${changePercent.toFixed(2)}%)`, {
      netWorth,
      change,
      changePercent
    });
  }

  async apiCall(service: string, endpoint: string, success: boolean, responseTime?: number): Promise<void> {
    const emoji = success ? '✅' : '❌';
    const timeStr = responseTime ? ` (${responseTime}ms)` : '';
    await this.log(LogLevel.DEBUG, `${emoji} API ${service}:${endpoint}${timeStr}`, {
      service,
      endpoint,
      success,
      responseTime
    });
  }
}

// Default logger instance
export const logger = new Logger(LogLevel.INFO, 'trading.log');