"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketAnalysisService = void 0;
const web3_js_1 = require("@solana/web3.js");
const RateLimiter_1 = require("../utils/RateLimiter");
class MarketAnalysisService {
    constructor(connection, logger, maxPriceHistoryLength = 1000) {
        this.connection = connection;
        this.logger = logger;
        this.maxPriceHistoryLength = maxPriceHistoryLength;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 минут
        this.tokenCache = new Map();
        this.priceHistory = new Map();
        this.errors = [];
        this.lastHealthCheck = 0;
        this.startTime = Date.now();
        // 100 запросов в минуту к RPC
        this.rateLimiter = new RateLimiter_1.RateLimiter(100, 60000);
        this.logger.info('MarketAnalysisService initialized', {
            cacheDuration: this.CACHE_DURATION,
            maxPriceHistoryLength: this.maxPriceHistoryLength,
            timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
            user: 'klakrketn'
        });
    }
    async getTokenPrice(mint) {
        try {
            const price = await this.getCurrentPrice(mint);
            return price || 0;
        }
        catch (error) {
            this.logger.error('Error getting token price', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }
    async getVolatility(mint) {
        try {
            const riskMetrics = await this.calculateRiskMetrics(mint);
            return riskMetrics?.volatility || 0;
        }
        catch (error) {
            this.logger.error('Error getting volatility', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }
    async getRiskScore(mint) {
        try {
            const riskMetrics = await this.calculateRiskMetrics(mint);
            return riskMetrics?.riskScore || 0;
        }
        catch (error) {
            this.logger.error('Error getting risk score', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }
    async getMarketMetrics(mint) {
        return this.getMarketData(mint);
    }
    async healthCheck() {
        try {
            const startTime = Date.now();
            const tokenInfo = await this.getTokenInfo('So11111111111111111111111111111111111111112');
            const responseTime = Date.now() - startTime;
            const result = {
                serviceId: 'MarketAnalysisService',
                status: tokenInfo ? 'healthy' : 'degraded',
                timestamp: Date.now(),
                responseTime,
                details: {
                    cacheSize: this.tokenCache.size,
                    priceHistorySize: this.priceHistory.size,
                    uptime: Date.now() - this.startTime
                },
                checkedBy: 'klakrketn'
            };
            this.lastHealthCheck = Date.now();
            return result;
        }
        catch (error) {
            return {
                serviceId: 'MarketAnalysisService',
                status: 'failed',
                timestamp: Date.now(),
                responseTime: 0,
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                },
                checkedBy: 'klakrketn'
            };
        }
    }
    async getServiceHealth() {
        const healthCheck = await this.healthCheck();
        const metrics = await this.getPerformanceMetrics();
        return {
            isHealthy: healthCheck.status === 'healthy',
            lastCheck: this.lastHealthCheck,
            errors: this.errors.slice(-10),
            performance: metrics,
            status: {
                isHealthy: healthCheck.status === 'healthy',
                lastCheck: this.lastHealthCheck,
                errors: this.errors,
                metrics: {
                    requestsPerMinute: this.rateLimiter.getRequestCount(),
                    averageResponseTime: healthCheck.responseTime,
                    errorRate: this.calculateErrorRate(),
                    lastUpdated: Date.now(),
                    updatedBy: 'klakrketn'
                }
            }
        };
    }
    async getPerformanceMetrics() {
        const startTime = Date.now();
        return {
            cpuUsage: process.cpuUsage().user,
            memoryUsage: process.memoryUsage().heapUsed,
            networkLatency: Date.now() - startTime,
            rpcLatency: 0,
            transactionsPerSecond: 0,
            pendingTransactions: 0,
            lastBlockProcessingTime: 0,
            timestamp: Date.now(),
            collector: 'klakrketn'
        };
    }
    calculateErrorRate() {
        const timeWindow = 60000; // 1 минута
        const recentErrors = this.errors.filter(error => error.timestamp > Date.now() - timeWindow).length;
        return recentErrors / 60; // Ошибок в секунду
    }
    async analyzeToken(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            const tokenInfo = await this.getTokenInfo(mint);
            if (!tokenInfo) {
                throw new Error(`Token info not found for mint: ${mint}`);
            }
            const priceHistory = this.priceHistory.get(mint) || [];
            const currentPrice = tokenInfo.price;
            // Обновляем историю цен
            this.updatePriceHistory(mint, currentPrice);
            const metrics = {
                mint,
                volume24h: tokenInfo.volume24h,
                priceChange24h: this.calculatePriceChange24h(priceHistory),
                liquidity: tokenInfo.liquidity,
                holders: tokenInfo.holders,
                transactions24h: await this.getTransactionCount24h(mint)
            };
            this.logger.debug('Token analysis completed', {
                mint,
                metrics,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return metrics;
        }
        catch (error) {
            this.logger.error('Error analyzing token', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }
    updatePriceHistory(mint, currentPrice) {
        const history = this.priceHistory.get(mint) || [];
        history.push({
            price: currentPrice,
            timestamp: Date.now()
        });
        // Удаляем старые записи
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filteredHistory = history
            .filter(entry => entry.timestamp > dayAgo)
            .slice(-this.maxPriceHistoryLength);
        this.priceHistory.set(mint, filteredHistory);
    }
    calculatePriceChange24h(priceHistory) {
        if (priceHistory.length < 2)
            return 0;
        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        // Находим ближайшую цену к 24 часам назад
        const oldPrice = priceHistory.find(entry => entry.timestamp >= dayAgo)?.price;
        const currentPrice = priceHistory[priceHistory.length - 1].price;
        if (!oldPrice)
            return 0;
        return ((currentPrice - oldPrice) / oldPrice) * 100;
    }
    async getCurrentPrice(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            const tokenInfo = await this.getTokenInfo(mint);
            return tokenInfo?.price || null;
        }
        catch (error) {
            this.logger.error('Error getting current price', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }
    async getMarketData(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            const tokenInfo = await this.getTokenInfo(mint);
            if (!tokenInfo) {
                return null;
            }
            const priceHistory = this.priceHistory.get(mint) || [];
            return {
                price: tokenInfo.price,
                volume24h: tokenInfo.volume24h,
                marketCap: tokenInfo.marketCap,
                fullyDilutedMarketCap: tokenInfo.totalSupply * tokenInfo.price,
                circulatingSupply: tokenInfo.totalSupply, // Уточнить через API
                totalSupply: tokenInfo.totalSupply,
                priceChange: {
                    '1h': this.calculatePriceChangeForPeriod(priceHistory, 60 * 60 * 1000),
                    '24h': this.calculatePriceChangeForPeriod(priceHistory, 24 * 60 * 60 * 1000),
                    '7d': this.calculatePriceChangeForPeriod(priceHistory, 7 * 24 * 60 * 60 * 1000)
                },
                highLow: {
                    '24h': this.calculateHighLow(priceHistory, 24 * 60 * 60 * 1000),
                    '7d': this.calculateHighLow(priceHistory, 7 * 24 * 60 * 60 * 1000)
                },
                lastUpdated: new Date()
            };
        }
        catch (error) {
            this.logger.error('Error getting market data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }
    calculatePriceChangeForPeriod(priceHistory, periodMs) {
        const now = Date.now();
        const periodStart = now - periodMs;
        const oldPrice = priceHistory.find(entry => entry.timestamp >= periodStart)?.price;
        const currentPrice = priceHistory[priceHistory.length - 1]?.price;
        if (!oldPrice || !currentPrice)
            return 0;
        return ((currentPrice - oldPrice) / oldPrice) * 100;
    }
    calculateHighLow(priceHistory, periodMs) {
        const now = Date.now();
        const periodStart = now - periodMs;
        const relevantPrices = priceHistory
            .filter(entry => entry.timestamp >= periodStart)
            .map(entry => entry.price);
        if (relevantPrices.length === 0) {
            return { high: 0, low: 0 };
        }
        return {
            high: Math.max(...relevantPrices),
            low: Math.min(...relevantPrices)
        };
    }
    async calculateRiskMetrics(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            const priceHistory = this.priceHistory.get(mint) || [];
            if (priceHistory.length < 2) {
                return null;
            }
            const prices = priceHistory.map(entry => entry.price);
            const returns = this.calculateReturns(prices);
            const volatility = this.calculateVolatility(returns);
            const sharpeRatio = this.calculateSharpeRatio(returns, volatility);
            const maxDrawdown = this.calculateMaxDrawdown(prices);
            const successRate = this.calculateSuccessRate(returns);
            return {
                volatility,
                sharpeRatio,
                maxDrawdown,
                successRate,
                failureRate: 1 - successRate,
                riskScore: this.calculateRiskScore(volatility, maxDrawdown, successRate)
            };
        }
        catch (error) {
            this.logger.error('Error calculating risk metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }
    calculateReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        return returns;
    }
    calculateVolatility(returns) {
        if (returns.length === 0)
            return 0;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
        return Math.sqrt(variance * 365); // Годовая волатильность
    }
    calculateSharpeRatio(returns, volatility) {
        if (returns.length === 0 || volatility === 0)
            return 0;
        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const riskFreeRate = 0.02; // 2% годовых
        return (meanReturn * 365 - riskFreeRate) / volatility;
    }
    calculateMaxDrawdown(prices) {
        let maxDrawdown = 0;
        let peak = prices[0];
        for (const price of prices) {
            if (price > peak) {
                peak = price;
            }
            const drawdown = (peak - price) / peak;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        return maxDrawdown;
    }
    calculateSuccessRate(returns) {
        if (returns.length === 0)
            return 0;
        const positiveReturns = returns.filter(r => r > 0).length;
        return positiveReturns / returns.length;
    }
    calculateRiskScore(volatility, maxDrawdown, successRate) {
        // Нормализация показателей
        const normalizedVolatility = Math.min(volatility / 2, 1); // Считаем волатильность > 200% максимальным риском
        const normalizedDrawdown = Math.min(maxDrawdown, 1);
        const normalizedSuccessRate = 1 - successRate; // Инвертируем для риска
        // Веса факторов
        const weights = {
            volatility: 0.4,
            drawdown: 0.4,
            successRate: 0.2
        };
        return (normalizedVolatility * weights.volatility +
            normalizedDrawdown * weights.drawdown +
            normalizedSuccessRate * weights.successRate);
    }
    async getTokenInfo(mint) {
        try {
            // Проверяем кэш
            const cached = this.tokenCache.get(mint);
            if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
                return cached.data;
            }
            await this.rateLimiter.waitForSlot();
            // Здесь должен быть запрос к API для получения информации о токене
            // Например, к Jupiter API или Raydium API
            const tokenSupply = await this.connection.getTokenSupply(new web3_js_1.PublicKey(mint));
            // Заглушка для демонстрации
            const tokenInfo = {
                mint,
                symbol: 'TOKEN',
                name: 'Unknown Token',
                decimals: tokenSupply.value.decimals,
                totalSupply: tokenSupply.value.uiAmount || 0,
                holders: 0, // Требуется запрос к индексеру
                price: 0, // Требуется запрос к DEX
                priceChange24h: 0,
                volume24h: 0,
                liquidity: 0,
                marketCap: 0
            };
            // Кэшируем результат
            this.tokenCache.set(mint, {
                data: tokenInfo,
                timestamp: Date.now()
            });
            return tokenInfo;
        }
        catch (error) {
            this.logger.error('Error fetching token info', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }
    async getTransactionCount24h(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            const signature = await this.connection.getSignaturesForAddress(new web3_js_1.PublicKey(mint), { limit: 1000 });
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            return signature.filter(sig => sig.blockTime && sig.blockTime * 1000 > dayAgo).length;
        }
        catch (error) {
            this.logger.error('Error getting transaction count', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }
    // Метод для очистки кэша
    clearCache() {
        this.tokenCache.clear();
        this.priceHistory.clear();
        this.logger.info('Cache cleared', {
            timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
            user: 'klakrketn'
        });
    }
}
exports.MarketAnalysisService = MarketAnalysisService;
