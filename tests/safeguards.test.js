const TradingSafeguards = require('../utils/safeguards');
const { ethers } = require('ethers');

describe('TradingSafeguards', () => {
    let safeguards;

    beforeEach(() => {
        safeguards = new TradingSafeguards({
            maxSlippage: 2.0,
            maxPriceDeviation: 5.0,
            maxGasPrice: 100
        });
    });

    describe('checkSlippage', () => {
        test('should accept slippage within limits', async () => {
            const result = await safeguards.checkSlippage(100, 101);
            expect(result).toBe(true);
        });

        test('should reject excessive slippage', async () => {
            const result = await safeguards.checkSlippage(100, 103);
            expect(result).toBe(false);
        });
    });

    describe('checkPriceDeviation', () => {
        test('should accept normal price movements', async () => {
            // Ajouter quelques prix historiques
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(101);
            safeguards.updatePriceHistory(102);
            safeguards.updatePriceHistory(103);
            safeguards.updatePriceHistory(104);
            
            const result = await safeguards.checkPriceDeviation(105);
            expect(result).toBe(true);
        });

        test('should reject abnormal price movements', async () => {
            // Ajouter des prix historiques stables
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(100);
            
            // Un mouvement de prix de 10% devrait être rejeté
            const result = await safeguards.checkPriceDeviation(110);
            expect(result).toBe(false);
        });
    });

    describe('checkGasPrice', () => {
        test('should accept normal gas price', async () => {
            const mockProvider = {
                getGasPrice: jest.fn().mockResolvedValue(ethers.parseUnits('50', 'gwei'))
            };
            const result = await safeguards.checkGasPrice(mockProvider);
            expect(result).toBe(true);
        });

        test('should reject high gas price', async () => {
            const mockProvider = {
                getGasPrice: jest.fn().mockResolvedValue(ethers.parseUnits('150', 'gwei'))
            };
            const result = await safeguards.checkGasPrice(mockProvider);
            expect(result).toBe(false);
        });
    });

    describe('calculateAveragePrice', () => {
        test('should return null with insufficient history', () => {
            safeguards.updatePriceHistory(100);
            expect(safeguards.calculateAveragePrice()).toBeNull();
        });

        test('should calculate correct average', () => {
            safeguards.updatePriceHistory(100);
            safeguards.updatePriceHistory(200);
            safeguards.updatePriceHistory(300);
            safeguards.updatePriceHistory(400);
            safeguards.updatePriceHistory(500);
            
            expect(safeguards.calculateAveragePrice()).toBe(300);
        });
    });
});
