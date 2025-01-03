const RetryStrategy = require('../utils/retry');

describe('RetryStrategy', () => {
    let retry;

    beforeEach(() => {
        retry = new RetryStrategy({
            maxAttempts: 3,
            initialDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            jitterFactor: 0 // Désactiver le jitter pour les tests
        });
    });

    describe('calculateDelay', () => {
        test('should increase delay exponentially', () => {
            expect(retry.calculateDelay(0)).toBe(100);
            expect(retry.calculateDelay(1)).toBe(200);
            expect(retry.calculateDelay(2)).toBe(400);
        });

        test('should respect maxDelay', () => {
            expect(retry.calculateDelay(10)).toBe(1000);
        });
    });

    describe('execute', () => {
        test('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            const result = await retry.execute(operation);
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should retry on failure', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce('fail')
                .mockRejectedValueOnce('fail')
                .mockResolvedValue('success');

            const result = await retry.execute(operation);
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        test('should throw after max attempts', async () => {
            const operation = jest.fn().mockRejectedValue('fail');
            await expect(retry.execute(operation)).rejects.toEqual('fail');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        test('should not retry on fatal errors', async () => {
            const operation = jest.fn().mockRejectedValue('insufficient funds');
            await expect(retry.execute(operation)).rejects.toEqual('insufficient funds');
            expect(operation).toHaveBeenCalledTimes(1);
        });
    });
});

describe('withRetry', () => {
    test('should wrap function with retry logic', async () => {
        const retry = new RetryStrategy({ maxAttempts: 2 });
        const mockFn = jest.fn()
            .mockRejectedValueOnce('fail')
            .mockResolvedValue('success');

        const wrapped = RetryStrategy.withRetry(mockFn, retry);
        const result = await wrapped();

        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(2);
    });
});
