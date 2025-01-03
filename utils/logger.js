const winston = require('winston');
const { format } = winston;
require('winston-daily-rotate-file');

// Configuration du format des logs
const logFormat = format.combine(
    format.timestamp(),
    format.json(),
    format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
        });
    })
);

// Configuration des transports
const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/bot-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d'
});

// Création du logger
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        transport,
        new winston.transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        })
    ]
});

// Niveaux de log personnalisés pour le trading
const TRADE_LEVELS = {
    TRADE_EXECUTED: 'trade_executed',
    TRADE_FAILED: 'trade_failed',
    PRICE_CHECK: 'price_check',
    SLIPPAGE_WARNING: 'slippage_warning',
    GAS_WARNING: 'gas_warning'
};

module.exports = {
    logger,
    TRADE_LEVELS
};
