import * as winston from 'winston';
import { MarketAnalysisService } from './MarketAnalysisService';
import { MonitoringService } from './MonitoringService';
import {
    RiskProfile,
    PositionRisk,
    RiskMetrics,
    TokenMetrics,
    TradeDecision
} from '../types/PumpFunTypes';

export class RiskManagementService {
    private readonly riskProfiles: Map<string, RiskProfile>;
    private readonly positionRisks: Map<string, PositionRisk>;
    private readonly DEFAULT_RISK_PROFILE: RiskProfile;
    private readonly MAX_EXPOSURE_TIME = 24 * 60 * 60 * 1000; // 24 часа
    private readonly RISK_CHECK_INTERVAL = 5 * 60 * 1000; // 5 минут
    private readonly checkInterval: NodeJS.Timer;

    private dailyStats: {
        totalLoss: number;
        totalProfit: number;
        tradeCount: number;
        lastReset: number;
        trades: Map<string, {
            amount: number;
            price: number;
            timestamp: number;
            type: 'buy' | 'sell';
        }[]>;
    };

    constructor(
        private marketAnalysis: MarketAnalysisService,
        private monitoring: MonitoringService,
        private logger: winston.Logger,
        private readonly maxDailyTrades: number = 50
    ) {
        this.riskProfiles = new Map();
        this.positionRisks = new Map();
        
        this.DEFAULT_RISK_PROFILE = {
            maxPositionSize: 5, // % от портфеля
            maxDailyLoss: 3, // % от портфеля
            maxDrawdown: 15, // % от портфеля
            maxOpenPositions: 5,
            stopLossLevel: 2, // %
            takeProfitLevel: 5, // %
            riskPerTrade: 1, // % от портфеля
            leverageAllowed: false,
            maxLeverage: 1
        };

        this.dailyStats = {
            totalLoss: 0,
            totalProfit: 0,
            tradeCount: 0,
            lastReset: Date.now(),
            trades: new Map()
        };

        this.initializeDailyReset();
        this.startRiskMonitoring();

        this.logger.info('RiskManagementService initialized', {
            timestamp: new Date().toISOString(),
            defaultProfile: this.DEFAULT_RISK_PROFILE,
            maxDailyTrades: this.maxDailyTrades,
            user: 'klakrketn' // Добавляем текущего пользователя
        });
    }

    private startRiskMonitoring(): void {
        this.checkInterval = setInterval(
            () => this.checkAllPositions(),
            this.RISK_CHECK_INTERVAL
        );
    }

    public stopRiskMonitoring(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }

    private initializeDailyReset(): void {
        setInterval(() => {
            const now = new Date();
            if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
                this.resetDailyStats();
            }
        }, 60000); // Проверка каждую минуту
    }

    private resetDailyStats(): void {
        const oldStats = { ...this.dailyStats };
        
        this.dailyStats = {
            totalLoss: 0,
            totalProfit: 0,
            tradeCount: 0,
            lastReset: Date.now(),
            trades: new Map()
        };

        this.logger.info('Daily stats reset', {
            timestamp: new Date().toISOString(),
            previousStats: {
                totalLoss: oldStats.totalLoss,
                totalProfit: oldStats.totalProfit,
                tradeCount: oldStats.tradeCount,
                netPnL: oldStats.totalProfit - oldStats.totalLoss
            }
        });
    }

    public async evaluateTradeRisk(
        mint: string,
        amount: number,
        price: number,
        portfolioValue: number,
        riskProfile: string = 'default'
    ): Promise<TradeDecision> {
        try {
            const profile = this.riskProfiles.get(riskProfile) || this.DEFAULT_RISK_PROFILE;
            const warnings: string[] = [];
            let approved = true;
            let maxAmount = (portfolioValue * profile.maxPositionSize) / 100;

            // Проверка дневных лимитов
            if (this.dailyStats.tradeCount >= this.maxDailyTrades) {
                return {
                    approved: false,
                    maxAmount: 0,
                    riskScore: 1,
                    warnings: ['Daily trade limit reached'],
                    timestamp: Date.now()
                };
            }

            // Проверка дневных убытков
            if (this.dailyStats.totalLoss > (portfolioValue * profile.maxDailyLoss) / 100) {
                return {
                    approved: false,
                    maxAmount: 0,
                    riskScore: 1,
                    warnings: ['Daily loss limit reached'],
                    timestamp: Date.now()
                };
            }

            const tokenMetrics = await this.marketAnalysis.analyzeToken(mint);
            if (!tokenMetrics) {
                return {
                    approved: false,
                    maxAmount: 0,
                    riskScore: 1,
                    warnings: ['Unable to analyze token metrics'],
                    timestamp: Date.now()
                };
            }

            const riskScore = await this.calculateRiskScore(tokenMetrics, amount, price, portfolioValue);

            // Проверки рисков
            if (amount > maxAmount) {
                approved = false;
                warnings.push(`Amount exceeds maximum position size of ${maxAmount}`);
            }

            if (riskScore > 0.8) {
                approved = false;
                warnings.push('Risk score too high');
            }

            if (tokenMetrics.liquidity < amount * price * 2) {
                approved = false;
                warnings.push('Insufficient liquidity');
            }

            const openPositionsCount = this.countOpenPositions();
            if (openPositionsCount >= profile.maxOpenPositions) {
                approved = false;
                warnings.push('Maximum number of open positions reached');
            }

            // Проверка волатильности
            const volatility = await this.calculateVolatility(mint);
            if (volatility > 0.5) { // 50% волатильность
                warnings.push('High volatility detected');
                maxAmount = maxAmount * 0.5; // Уменьшаем максимальный размер позиции
            }

            return {
                approved,
                maxAmount,
                riskScore,
                warnings,
                timestamp: Date.now(),
                suggestedStopLoss: this.calculateStopLoss(price, profile.stopLossLevel),
                suggestedTakeProfit: this.calculateTakeProfit(price, profile.takeProfitLevel)
            };

        } catch (error) {
            this.logger.error('Error evaluating trade risk', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                amount,
                price,
                timestamp: new Date().toISOString()
            });

            return {
                approved: false,
                maxAmount: 0,
                riskScore: 1,
                warnings: ['Error evaluating risk'],
                timestamp: Date.now()
            };
        }
    }

    private async calculateRiskScore(
        metrics: TokenMetrics,
        amount: number,
        price: number,
        portfolioValue: number
    ): Promise<number> {
        const positionSize = (amount * price / portfolioValue) * 100; // в процентах
        const liquidityRatio = amount * price / metrics.liquidity;
        
        const weights = {
            positionSize: 0.3,
            liquidity: 0.3,
            volume: 0.2,
            priceChange: 0.2
        };

        const scores = {
            positionSize: Math.min(positionSize / 10, 1),
            liquidity: Math.min(liquidityRatio * 2, 1),
            volume: Math.max(0, 1 - metrics.volume24h / 1000000),
            priceChange: Math.min(Math.abs(metrics.priceChange24h) / 50, 1)
        };

        return Object.entries(weights)
            .reduce((score, [key, weight]) => 
                score + (scores[key as keyof typeof scores] * weight), 0);
    }

    private async calculateVolatility(mint: string): Promise<number> {
        const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(mint);
        return riskMetrics?.volatility || 1;
    }

    private calculateStopLoss(price: number, level: number): number {
        return price * (1 - level / 100);
    }

    private calculateTakeProfit(price: number, level: number): number {
        return price * (1 + level / 100);
    }

    private countOpenPositions(): number {
        return this.positionRisks.size;
    }

    public async updatePosition(
        mint: string,
        amount: number,
        price: number,
        type: 'buy' | 'sell'
    ): void {
        const trades = this.dailyStats.trades.get(mint) || [];
        trades.push({
            amount,
            price,
            timestamp: Date.now(),
            type
        });
        this.dailyStats.trades.set(mint, trades);

        if (type === 'buy') {
            this.positionRisks.set(mint, {
                mint,
                riskScore: await this.calculatePositionRisk(mint, amount, price),
                maxLoss: amount * price * 0.1, // 10% максимальный убыток
                exposure: amount * price,
                liquidationPrice: price * 0.9, // 90% от цены входа
                recommendation: 'maintain',
                warningLevel: 'low'
            });
        } else {
            this.positionRisks.delete(mint);
        }

        await this.updateDailyStats(mint);
    }

    private async calculatePositionRisk(
        mint: string,
        amount: number,
        price: number
    ): Promise<number> {
        const metrics = await this.marketAnalysis.analyzeToken(mint);
        if (!metrics) return 1;

        const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(mint);
        if (!riskMetrics) return 1;

        return (
            (riskMetrics.volatility * 0.3) +
            (riskMetrics.maxDrawdown * 0.3) +
            ((1 - riskMetrics.successRate) * 0.4)
        );
    }

    private async updateDailyStats(mint: string): Promise<void> {
        const trades = this.dailyStats.trades.get(mint) || [];
        if (trades.length < 2) return;

        const lastTrade = trades[trades.length - 1];
        const previousTrade = trades[trades.length - 2];

        if (lastTrade.type === 'sell' && previousTrade.type === 'buy') {
            const pnl = (lastTrade.price - previousTrade.price) * lastTrade.amount;
            if (pnl > 0) {
                this.dailyStats.totalProfit += pnl;
            } else {
                this.dailyStats.totalLoss += Math.abs(pnl);
            }
        }

        this.dailyStats.tradeCount++;

        this.logger.info('Daily stats updated', {
            mint,
            totalProfit: this.dailyStats.totalProfit,
            totalLoss: this.dailyStats.totalLoss,
            tradeCount: this.dailyStats.tradeCount,
            timestamp: new Date().toISOString()
        });
    }

    private async checkAllPositions(): Promise<void> {
        try {
            for (const [mint, position] of this.positionRisks.entries()) {
                const currentPrice = await this.marketAnalysis.getCurrentPrice(mint);
                if (!currentPrice) continue;

                const unrealizedPnL = (currentPrice - position.liquidationPrice) * 
                    (position.exposure / position.liquidationPrice);

                const riskScore = await this.calculatePositionRisk(
                    mint,
                    position.exposure / currentPrice,
                    currentPrice
                );

                const timeSinceEntry = Date.now() - 
                    (this.dailyStats.trades.get(mint)?.slice(-1)[0]?.timestamp || 0);

                // Обновляем рекомендации
                let recommendation: 'increase' | 'maintain' | 'reduce' | 'close' = 'maintain';
                let warningLevel: 'low' | 'medium' | 'high' = 'low';

                if (unrealizedPnL < -position.maxLoss) {
                    recommendation = 'close';
                    warningLevel = 'high';
                } else if (riskScore > 0.8) {
                    recommendation = 'reduce';
                    warningLevel = 'high';
                } else if (timeSinceEntry > this.MAX_EXPOSURE_TIME) {
                    recommendation = 'reduce';
                    warningLevel = 'medium';
                }

                this.positionRisks.set(mint, {
                    ...position,
                    riskScore,
                    recommendation,
                    warningLevel
                });

                this.logger.debug('Position check completed', {
                    mint,
                    unrealizedPnL,
                    riskScore,
                    recommendation,
                    warningLevel,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.logger.error('Error checking positions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }

    public getPositionRisk(mint: string): PositionRisk | null {
        return this.positionRisks.get(mint) || null;
    }

    public getAllPositionRisks(): PositionRisk[] {
        return Array.from(this.positionRisks.values());
    }

    public getRiskProfile(name: string): RiskProfile {
        return this.riskProfiles.get(name) || this.DEFAULT_RISK_PROFILE;
    }

    public setRiskProfile(name: string, profile: RiskProfile): void {
        this.riskProfiles.set(name, {
            ...this.DEFAULT_RISK_PROFILE,
            ...profile
        });
        
        this.logger.info('Risk profile updated', {
            name,
            profile,
            timestamp: new Date().toISOString(),
            user: 'klakrketn'
        });
    }

    public getDailyStats() {
        return {
            ...this.dailyStats,
            netPnL: this.dailyStats.totalProfit - this.dailyStats.totalLoss
        };
    }
}