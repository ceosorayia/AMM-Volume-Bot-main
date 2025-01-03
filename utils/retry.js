const { logger } = require('./logger');

class RetryStrategy {
    constructor(config = {}) {
        this.maxAttempts = config.maxAttempts || 3;
        this.initialDelay = config.initialDelay || 1000;
        this.maxDelay = config.maxDelay || 30000;
        this.backoffFactor = config.backoffFactor || 2;
        this.jitterFactor = config.jitterFactor === undefined ? 0.1 : config.jitterFactor;
    }

    calculateDelay(attempt) {
        const baseDelay = Math.min(
            this.initialDelay * Math.pow(this.backoffFactor, attempt),
            this.maxDelay
        );

        if (this.jitterFactor === 0) {
            return baseDelay;
        }

        const jitter = baseDelay * this.jitterFactor * (Math.random() * 2 - 1);
        return Math.floor(baseDelay + jitter);
    }

    async execute(operation) {
        let lastError;
        
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                logger.info('Attempting operation', { attempt: attempt + 1, maxAttempts: this.maxAttempts });
                const result = await operation();
                if (attempt === this.maxAttempts - 1) {
                    logger.info('operation succeeded after ' + (attempt + 1) + ' attempts');
                }
                return result;
            } catch (error) {
                lastError = error;
                
                // Check for fatal errors that shouldn't be retried
                if (typeof error === 'string' && error.includes('insufficient funds')) {
                    logger.error('Fatal error in operation, stopping retries', {
                        attempt: attempt + 1,
                        error: error
                    });
                    throw error;
                }

                if (attempt < this.maxAttempts - 1) {
                    const nextDelay = this.calculateDelay(attempt);
                    logger.warn('operation failed, retrying in ' + nextDelay + 'ms', {
                        attempt: attempt + 1,
                        error: error,
                        nextDelay: nextDelay
                    });
                    await new Promise(resolve => setTimeout(resolve, nextDelay));
                }
            }
        }

        logger.error('operation failed after ' + this.maxAttempts + ' attempts', {
            error: lastError
        });
        throw lastError;
    }
}

// Helper function to wrap an operation with retry logic
const withRetry = async (operation, config = {}) => {
    const retryStrategy = new RetryStrategy(config);
    return retryStrategy.execute(operation);
};

module.exports = { RetryStrategy, withRetry };
