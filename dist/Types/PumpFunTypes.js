"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
// Константы
exports.Constants = {
    MAX_RETRIES: 3,
    REQUEST_TIMEOUT: 30000,
    CACHE_TTL: 300000, // 5 минут
    MAX_BATCH_SIZE: 100,
    MIN_LIQUIDITY: 1000,
    MAX_SLIPPAGE: 0.01,
    DEFAULT_GAS_ADJUSTMENT: 1.4,
    RATE_LIMIT_WINDOW: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    // Новые константы для мониторинга
    HEALTH_CHECK_INTERVAL: 60000, // 1 минута
    MAX_ERROR_RETRY_DELAY: 300000, // 5 минут
    MIN_CONFIDENCE_THRESHOLD: 0.7,
    HIGH_CONFIDENCE_THRESHOLD: 0.9,
    // Константы для управления рисками
    MAX_POSITION_SIZE_USD: 10000,
    MAX_DAILY_LOSS_USD: 1000,
    DEFAULT_STOP_LOSS_PERCENT: 0.05,
    DEFAULT_TAKE_PROFIT_PERCENT: 0.1,
    // Временные константы
    DATE_FORMAT: 'YYYY-MM-DD HH:mm:ss',
    MAX_TRANSACTION_AGE: 3600, // 1 час
    PRICE_UPDATE_INTERVAL: 15000, // 15 секунд
    // Системные константы
    VERSION: '1.0.0',
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    DEFAULT_USER: 'klakrketn'
};
