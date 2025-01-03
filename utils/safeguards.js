const { ethers } = require('ethers');
const { logger, TRADE_LEVELS } = require('./logger');

class TradingSafeguards {
    constructor(config = {}) {
        this.maxSlippage = config.maxSlippage || 2.0;
        this.maxPriceDeviation = config.maxPriceDeviation || 5.0;
        this.minLiquidity = config.minLiquidity || ethers.parseEther("1.0");
        this.maxGasPrice = config.maxGasPrice || 100;
        this.priceHistory = [];
        this.maxPriceHistoryLength = 100;
    }

    async checkSlippage(expectedPrice, actualPrice) {
        const slippage = Math.abs((actualPrice - expectedPrice) / expectedPrice * 100);
        
        if (slippage > this.maxSlippage) {
            logger.warn('Slippage warning', {
                level: TRADE_LEVELS.SLIPPAGE_WARNING,
                expectedPrice,
                actualPrice,
                slippage
            });
            return false;
        }
        return true;
    }

    async checkPriceDeviation(currentPrice) {
        if (this.priceHistory.length < 5) {
            this.updatePriceHistory(currentPrice);
            return true; // Pas assez d'historique pour juger
        }

        const avgPrice = this.calculateAveragePrice();
        const deviation = Math.abs((currentPrice - avgPrice) / avgPrice * 100);
        
        // Mettre à jour l'historique seulement si le prix n'est pas trop déviant
        if (deviation <= this.maxPriceDeviation) {
            this.updatePriceHistory(currentPrice);
            return true;
        }

        logger.warn('Price deviation warning', {
            level: TRADE_LEVELS.PRICE_CHECK,
            currentPrice,
            averagePrice: avgPrice,
            deviation,
            maxDeviation: this.maxPriceDeviation
        });
        return false;
    }

    async checkGasPrice(provider) {
        try {
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            const gasPriceInGwei = Number(ethers.formatUnits(gasPrice, "gwei"));
            
            if (gasPriceInGwei > this.maxGasPrice) {
                logger.warn('Gas price too high', {
                    level: TRADE_LEVELS.GAS_WARNING,
                    currentGasPrice: gasPriceInGwei,
                    maxGasPrice: this.maxGasPrice
                });
                return false;
            }
            return true;
        } catch (error) {
            logger.error('Error checking gas price', {
                level: TRADE_LEVELS.GAS_WARNING,
                error
            });
            return false;
        }
    }

    updatePriceHistory(price) {
        this.priceHistory.push({
            price,
            timestamp: Date.now()
        });
        
        if (this.priceHistory.length > this.maxPriceHistoryLength) {
            this.priceHistory.shift();
        }
    }

    calculateAveragePrice() {
        if (this.priceHistory.length < 5) return null;
        
        const recentPrices = this.priceHistory.slice(-5); // Utiliser les 5 derniers prix
        const sum = recentPrices.reduce((acc, curr) => acc + curr.price, 0);
        return sum / recentPrices.length;
    }
}

module.exports = TradingSafeguards;
