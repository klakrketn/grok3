import * as winston from 'winston';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
    MarketData, 
    TokenInfo, 
    RiskMetrics, 
    TokenMetrics,
    ServiceHealth,
    HealthCheckResult,
    PerformanceMetrics
} from '../types/PumpFunTypes';
import { RateLimiter } from '../utils/RateLimiter';
import { IMarketAnalysisService } from '../interfaces/IServices';

interface TokenCache {
    data: TokenInfo;
    timestamp: number;
}

export class MarketAnalysisService implements IMarketAnalysisService {
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 минут
    private readonly tokenCache: Map<string, TokenCache> = new Map();
    private readonly rateLimiter: RateLimiter;
    private readonly priceHistory: Map<string, { price: number; timestamp: number }[]> = new Map();
    private readonly startTime: number;
    private readonly errors: Error[] = [];
    private lastHealthCheck: number = 0;

    constructor(
        private readonly connection: Connection,
        public readonly logger: winston.Logger,
        private readonly maxPriceHistoryLength: number = 1000
    ) {
        this.startTime = Date.now();
        // 100 запросов в минуту к RPC
        this.rateLimiter = new RateLimiter(100, 60000);
        
        this.logger.info('MarketAnalysisService initialized', {
            cacheDuration: this.CACHE_DURATION,
            maxPriceHistoryLength: this.maxPriceHistoryLength,
            timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
            user: 'klakrketn'
        });
    }

    public async getTokenPrice(mint: string): Promise<number> {
        try {
            const price = await this.getCurrentPrice(mint);
            return price || 0;
        } catch (error) {
            this.logger.error('Error getting token price', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }

    public async getVolatility(mint: string): Promise<number> {
        try {
            const riskMetrics = await this.calculateRiskMetrics(mint);
            return riskMetrics?.volatility || 0;
        } catch (error) {
            this.logger.error('Error getting volatility', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }

    public async getRiskScore(mint: string): Promise<number> {
        try {
            const riskMetrics = await this.calculateRiskMetrics(mint);
            return riskMetrics?.riskScore || 0;
        } catch (error) {
            this.logger.error('Error getting risk score', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:10:04Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }

    public async getMarketMetrics(mint: string): Promise<MarketData | null> {
        return this.getMarketData(mint);
    }

    public async healthCheck(): Promise<HealthCheckResult> {
        try {
            const startTime = Date.now();
            const tokenInfo = await this.getTokenInfo('So11111111111111111111111111111111111111112');
            const responseTime = Date.now() - startTime;

            const result: HealthCheckResult = {
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
        } catch (error) {
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

    public async getServiceHealth(): Promise<ServiceHealth> {
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

    private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
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

    private calculateErrorRate(): number {
        const timeWindow = 60000; // 1 минута
        const recentErrors = this.errors.filter(
            error => error.timestamp > Date.now() - timeWindow
        ).length;
        return recentErrors / 60; // Ошибок в секунду
    }
    async analyzeToken(mint: string): Promise<TokenMetrics | null> {
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

            const metrics: TokenMetrics = {
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

        } catch (error) {
            this.logger.error('Error analyzing token', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    private updatePriceHistory(mint: string, currentPrice: number): void {
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

    private calculatePriceChange24h(priceHistory: { price: number; timestamp: number }[]): number {
        if (priceHistory.length < 2) return 0;

        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;

        // Находим ближайшую цену к 24 часам назад
        const oldPrice = priceHistory.find(entry => entry.timestamp >= dayAgo)?.price;
        const currentPrice = priceHistory[priceHistory.length - 1].price;

        if (!oldPrice) return 0;

        return ((currentPrice - oldPrice) / oldPrice) * 100;
    }

    async getCurrentPrice(mint: string): Promise<number | null> {
        try {
            await this.rateLimiter.waitForSlot();

            const tokenInfo = await this.getTokenInfo(mint);
            return tokenInfo?.price || null;

        } catch (error) {
            this.logger.error('Error getting current price', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    async getMarketData(mint: string): Promise<MarketData | null> {
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

        } catch (error) {
            this.logger.error('Error getting market data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    private calculatePriceChangeForPeriod(
        priceHistory: { price: number; timestamp: number }[], 
        periodMs: number
    ): number {
        const now = Date.now();
        const periodStart = now - periodMs;

        const oldPrice = priceHistory.find(entry => entry.timestamp >= periodStart)?.price;
        const currentPrice = priceHistory[priceHistory.length - 1]?.price;

        if (!oldPrice || !currentPrice) return 0;

        return ((currentPrice - oldPrice) / oldPrice) * 100;
    }

    private calculateHighLow(
        priceHistory: { price: number; timestamp: number }[], 
        periodMs: number
    ): { high: number; low: number } {
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

    async calculateRiskMetrics(mint: string): Promise<RiskMetrics | null> {
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

        } catch (error) {
            this.logger.error('Error calculating risk metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    private calculateReturns(prices: number[]): number[] {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        return returns;
    }

    private calculateVolatility(returns: number[]): number {
        if (returns.length === 0) return 0;

        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
        
        return Math.sqrt(variance * 365); // Годовая волатильность
    }

    private calculateSharpeRatio(returns: number[], volatility: number): number {
        if (returns.length === 0 || volatility === 0) return 0;

        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const riskFreeRate = 0.02; // 2% годовых
        
        return (meanReturn * 365 - riskFreeRate) / volatility;
    }

    private calculateMaxDrawdown(prices: number[]): number {
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

    private calculateSuccessRate(returns: number[]): number {
        if (returns.length === 0) return 0;

        const positiveReturns = returns.filter(r => r > 0).length;
        return positiveReturns / returns.length;
    }

    private calculateRiskScore(
        volatility: number,
        maxDrawdown: number,
        successRate: number
    ): number {
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

        return (
            normalizedVolatility * weights.volatility +
            normalizedDrawdown * weights.drawdown +
            normalizedSuccessRate * weights.successRate
        );
    }

    private async getTokenInfo(mint: string): Promise<TokenInfo | null> {
        try {
            // Проверяем кэш
            const cached = this.tokenCache.get(mint);
            if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
                return cached.data;
            }

            await this.rateLimiter.waitForSlot();

            // Здесь должен быть запрос к API для получения информации о токене
            // Например, к Jupiter API или Raydium API
            const tokenSupply = await this.connection.getTokenSupply(new PublicKey(mint));
            
            // Заглушка для демонстрации
            const tokenInfo: TokenInfo = {
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

        } catch (error) {
            this.logger.error('Error fetching token info', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    private async getTransactionCount24h(mint: string): Promise<number> {
        try {
            await this.rateLimiter.waitForSlot();

            const signature = await this.connection.getSignaturesForAddress(
                new PublicKey(mint),
                { limit: 1000 }
            );

            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            return signature.filter(sig => sig.blockTime && sig.blockTime * 1000 > dayAgo).length;

        } catch (error) {
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
    public clearCache(): void {
        this.tokenCache.clear();
        this.priceHistory.clear();
        this.logger.info('Cache cleared', {
            timestamp: new Date('2025-02-21T21:13:24Z').toISOString(),
            user: 'klakrketn'
        });
    }
}