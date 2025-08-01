import { logger } from './logger.js';

export enum ErrorType {
  API_ERROR = 'API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TRADING_ERROR = 'TRADING_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class TradingError extends Error {
  public readonly type: ErrorType;
  public readonly context?: Record<string, any>;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    type: ErrorType,
    context?: Record<string, any>,
    recoverable: boolean = false
  ) {
    super(message);
    this.name = 'TradingError';
    this.type = type;
    this.context = context;
    this.recoverable = recoverable;
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts: Map<ErrorType, number> = new Map();
  private lastErrors: Map<ErrorType, Date> = new Map();

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  private incrementErrorCount(type: ErrorType): void {
    const current = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, current + 1);
    this.lastErrors.set(type, new Date());
  }

  async handleError(error: Error | TradingError, context?: Record<string, any>): Promise<void> {
    let tradingError: TradingError;

    if (error instanceof TradingError) {
      tradingError = error;
    } else {
      // Convert regular errors to TradingErrors
      tradingError = this.classifyError(error, context);
    }

    this.incrementErrorCount(tradingError.type);

    await logger.error(
      `${tradingError.type}: ${tradingError.message}`,
      tradingError,
      { ...tradingError.context, ...context }
    );

    // Log error statistics
    await this.logErrorStats();

    // Handle specific error types
    await this.handleSpecificError(tradingError);
  }

  private classifyError(error: Error, context?: Record<string, any>): TradingError {
    const message = error.message.toLowerCase();

    // Network-related errors
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return new TradingError(
        error.message,
        ErrorType.NETWORK_ERROR,
        context,
        true // Network errors are often recoverable
      );
    }

    // API-related errors
    if (message.includes('api') || message.includes('unauthorized') || message.includes('forbidden')) {
      return new TradingError(
        error.message,
        ErrorType.API_ERROR,
        context,
        false // API errors often require manual intervention
      );
    }

    // Trading-specific errors
    if (message.includes('order') || message.includes('trade') || message.includes('position')) {
      return new TradingError(
        error.message,
        ErrorType.TRADING_ERROR,
        context,
        true
      );
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('validation') || message.includes('required')) {
      return new TradingError(
        error.message,
        ErrorType.VALIDATION_ERROR,
        context,
        false
      );
    }

    // Configuration errors
    if (message.includes('config') || message.includes('environment') || message.includes('missing')) {
      return new TradingError(
        error.message,
        ErrorType.CONFIGURATION_ERROR,
        context,
        false
      );
    }

    // Default to unknown error
    return new TradingError(
      error.message,
      ErrorType.UNKNOWN_ERROR,
      context,
      false
    );
  }

  private async handleSpecificError(error: TradingError): Promise<void> {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        await this.handleNetworkError(error);
        break;
      case ErrorType.API_ERROR:
        await this.handleApiError(error);
        break;
      case ErrorType.TRADING_ERROR:
        await this.handleTradingError(error);
        break;
      case ErrorType.CONFIGURATION_ERROR:
        await this.handleConfigurationError(error);
        break;
      default:
        await logger.warn('Unknown error type encountered', { errorType: error.type });
    }
  }

  private async handleNetworkError(error: TradingError): Promise<void> {
    const count = this.errorCounts.get(ErrorType.NETWORK_ERROR) || 0;
    
    if (count > 5) {
      await logger.warn('Multiple network errors detected. Consider checking internet connection.');
    }

    if (error.recoverable) {
      await logger.info('Network error is recoverable. Retrying may help.');
    }
  }

  private async handleApiError(error: TradingError): Promise<void> {
    const count = this.errorCounts.get(ErrorType.API_ERROR) || 0;
    
    if (count > 3) {
      await logger.error('Multiple API errors detected. Check API credentials and limits.');
    }

    if (error.message.includes('rate limit')) {
      await logger.warn('API rate limit hit. Consider reducing request frequency.');
    }
  }

  private async handleTradingError(error: TradingError): Promise<void> {
    await logger.warn('Trading operation failed. Review order parameters and account status.');
    
    if (error.message.includes('insufficient')) {
      await logger.warn('Insufficient funds or shares detected.');
    }
  }

  private async handleConfigurationError(error: TradingError): Promise<void> {
    await logger.error('Configuration error detected. Manual intervention required.');
    
    if (error.message.includes('environment')) {
      await logger.error('Check environment variables: OPENAI_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY');
    }
  }

  private async logErrorStats(): Promise<void> {
    if (this.errorCounts.size === 0) return;

    const stats: Record<string, number> = {};
    for (const [type, count] of this.errorCounts.entries()) {
      stats[type] = count;
    }

    await logger.debug('Error statistics', stats);
  }

  getErrorStats(): Record<ErrorType, { count: number; lastOccurrence?: Date }> {
    const stats: Record<ErrorType, { count: number; lastOccurrence?: Date }> = {} as any;
    
    for (const type of Object.values(ErrorType)) {
      stats[type] = {
        count: this.errorCounts.get(type) || 0,
        lastOccurrence: this.lastErrors.get(type)
      };
    }

    return stats;
  }

  reset(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }
}

// Utility functions for common error handling patterns
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: Record<string, any>
): Promise<T> {
  const errorHandler = ErrorHandler.getInstance();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      await errorHandler.handleError(
        error as Error,
        { ...context, attempt, maxRetries }
      );

      if (isLastAttempt) {
        throw error;
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('This should never be reached');
}

export async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T,
  context?: Record<string, any>
): Promise<T> {
  const errorHandler = ErrorHandler.getInstance();
  
  try {
    return await operation();
  } catch (error) {
    await errorHandler.handleError(error as Error, context);
    return fallback;
  }
}

// Global error handler
export function setupGlobalErrorHandler(): void {
  const errorHandler = ErrorHandler.getInstance();

  process.on('uncaughtException', async (error) => {
    await errorHandler.handleError(error, { source: 'uncaughtException' });
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    await errorHandler.handleError(error, { source: 'unhandledRejection' });
  });
}