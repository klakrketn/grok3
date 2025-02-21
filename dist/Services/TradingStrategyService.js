"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingStrategyService = void 0;
class TradingStrategyService {
    constructor(marketAnalysis, riskManagement, logger, backtestMode = false) {
        this.marketAnalysis = marketAnalysis;
        this.riskManagement = riskManagement;
        this.logger = logger;
        this.backtestMode = backtestMode;
        this.MAX_SIGNALS_PER_INTERVAL = 10;
        this.SIGNAL_INTERVAL = 5 * 60 * 1000; // 5 минут
        this.strategies = new Map();
        this.activeStrategies = new Set();
        this.strategyConfigs = new Map();
        this.signalHistory = new Map();
        this.DEFAULT_CONFIG = {
            timeframe: '5m',
            minVolume: 10000,
            minLiquidity: 50000,
            maxSlippage: 2,
            minConfidence: 0.7,
            maxRiskScore: 0.8,
            enabledIndicators: ['RSI', 'MACD', 'BB'],
            tradingPairs: ['SOL/USDC'],
            maxPositions: 5,
            maxLossPerTrade: 2,
            takeProfitLevel: 5,
            stopLossLevel: 2
        };
        this.initializeDefaultStrategies();
        this.logger.info('TradingStrategyService initialized', {
            timestamp: new Date('2025-02-21T14:44:43Z').toISOString(),
            user: 'klakrketn',
            backtestMode: this.backtestMode,
            defaultConfig: this.DEFAULT_CONFIG
        });
    }
    initializeDefaultStrategies() {
        // Стратегия пампов
        this.addStrategy('pump_detection', {
            name: 'Pump Detection Strategy',
            description: 'Detects and trades potential pump opportunities',
            analyze: async (mint) => {
                const metrics = await this.marketAnalysis.analyzeToken(mint);
                if (!metrics)
                    return null;
                return this.analyzePumpOpportunity(metrics);
            },
            config: {
                ...this.DEFAULT_CONFIG,
                minVolumeIncrease: 300, // 300% увеличение объема
                minPriceIncrease: 10, // 10% рост цены
                maxTimeWindow: 5 * 60 * 1000 // 5 минут
            }
        });
        // Стратегия тренда
        this.addStrategy('trend_following', {
            name: 'Trend Following Strategy',
            description: 'Follows established market trends',
            analyze: async (mint) => {
                const metrics = await this.marketAnalysis.analyzeToken(mint);
                if (!metrics)
                    return null;
                return this.analyzeTrendStrategy(metrics);
            },
            config: {
                ...this.DEFAULT_CONFIG,
                trendConfirmationPeriod: 15 * 60 * 1000, // 15 минут
                minTrendStrength: 0.7
            }
        });
        // Стратегия отката
        this.addStrategy('pullback_trading', {
            name: 'Pullback Trading Strategy',
            description: 'Trades pullbacks in strong trends',
            analyze: async (mint) => {
                const metrics = await this.marketAnalysis.analyzeToken(mint);
                if (!metrics)
                    return null;
                return this.analyzePullbackStrategy(metrics);
            },
            config: {
                ...this.DEFAULT_CONFIG,
                pullbackPercent: 5, // 5% откат
                maxPullbackTime: 10 * 60 * 1000 // 10 минут
            }
        });
    }
    async analyzePumpOpportunity(metrics) {
        try {
            const config = this.getStrategyConfig('pump_detection');
            const marketCondition = await this.analyzeMarketCondition(metrics.mint);
            if (!this.isValidMarketCondition(marketCondition, config)) {
                return null;
            }
            const volumeIncrease = metrics.volume24h / (metrics.volume24h - metrics.volume24h * 0.1);
            const priceIncrease = metrics.priceChange24h;
            if (volumeIncrease >= config.minVolumeIncrease &&
                priceIncrease >= config.minPriceIncrease) {
                const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(metrics.mint);
                if (!riskMetrics || riskMetrics.riskScore > config.maxRiskScore) {
                    return null;
                }
                return {
                    strategy: 'pump_detection',
                    action: 'BUY',
                    mint: metrics.mint,
                    confidence: this.calculateConfidence(volumeIncrease, priceIncrease, riskMetrics),
                    reason: [`Volume increase: ${volumeIncrease.toFixed(2)}%`,
                        `Price increase: ${priceIncrease.toFixed(2)}%`],
                    timestamp: Date.now(),
                    suggestedEntry: metrics.price,
                    suggestedExit: metrics.price * (1 + config.takeProfitLevel / 100),
                    stopLoss: metrics.price * (1 - config.stopLossLevel / 100),
                    metrics: metrics,
                    riskMetrics: riskMetrics
                };
            }
            return null;
        }
        catch (error) {
            this.logger.error('Error analyzing pump opportunity', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint: metrics.mint,
                timestamp: new Date('2025-02-21T14:44:43Z').toISOString()
            });
            return null;
        }
    }
    async analyzeTrendStrategy(metrics) {
        try {
            const config = this.getStrategyConfig('trend_following');
            const marketCondition = await this.analyzeMarketCondition(metrics.mint);
            if (!this.isValidMarketCondition(marketCondition, config)) {
                return null;
            }
            const trendStrength = this.calculateTrendStrength(metrics);
            if (trendStrength >= config.minTrendStrength) {
                const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(metrics.mint);
                if (!riskMetrics || riskMetrics.riskScore > config.maxRiskScore) {
                    return null;
                }
                const action = metrics.priceChange24h > 0 ? 'BUY' : 'SELL';
                return {
                    strategy: 'trend_following',
                    action,
                    mint: metrics.mint,
                    confidence: trendStrength,
                    reason: [`Trend strength: ${trendStrength.toFixed(2)}`,
                        `Price change: ${metrics.priceChange24h.toFixed(2)}%`],
                    timestamp: Date.now(),
                    suggestedEntry: metrics.price,
                    suggestedExit: action === 'BUY' ?
                        metrics.price * (1 + config.takeProfitLevel / 100) :
                        metrics.price * (1 - config.takeProfitLevel / 100),
                    stopLoss: action === 'BUY' ?
                        metrics.price * (1 - config.stopLossLevel / 100) :
                        metrics.price * (1 + config.stopLossLevel / 100),
                    metrics: metrics,
                    riskMetrics: riskMetrics
                };
            }
            return null;
        }
        catch (error) {
            this.logger.error('Error analyzing trend strategy', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint: metrics.mint,
                timestamp: new Date('2025-02-21T14:44:43Z').toISOString()
            });
            return null;
        }
    }
    async analyzePullbackStrategy(metrics) {
        try {
            const config = this.getStrategyConfig('pullback_trading');
            const marketCondition = await this.analyzeMarketCondition(metrics.mint);
            if (!this.isValidMarketCondition(marketCondition, config)) {
                return null;
            }
            const isPullback = this.isPullbackCondition(metrics, config.pullbackPercent);
            if (isPullback) {
                const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(metrics.mint);
                if (!riskMetrics || riskMetrics.riskScore > config.maxRiskScore) {
                    return null;
                }
                return {
                    strategy: 'pullback_trading',
                    action: 'BUY',
                    mint: metrics.mint,
                    confidence: this.calculatePullbackConfidence(metrics, riskMetrics),
                    reason: [`Pullback detected: ${config.pullbackPercent}%`],
                    timestamp: Date.now(),
                    suggestedEntry: metrics.price,
                    suggestedExit: metrics.price * (1 + config.takeProfitLevel / 100),
                    stopLoss: metrics.price * (1 - config.stopLossLevel / 100),
                    metrics: metrics,
                    riskMetrics: riskMetrics
                };
            }
            return null;
        }
        catch (error) {
            this.logger.error('Error analyzing pullback strategy', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint: metrics.mint,
                timestamp: new Date('2025-02-21T14:44:43Z').toISOString()
            });
            return null;
        }
    }
    calculateTrendStrength(metrics) {
        const priceChange = Math.abs(metrics.priceChange24h);
        const volume = metrics.volume24h;
        const normalized = Math.min(priceChange / 100, 1) * Math.min(volume / 1000000, 1);
        return normalized;
    }
    isPullbackCondition(metrics, pullbackPercent) {
        return metrics.priceChange24h < -pullbackPercent &&
            metrics.volume24h > metrics.volume24h * 0.5;
    }
    calculatePullbackConfidence(metrics, riskMetrics) {
        const volumeScore = Math.min(metrics.volume24h / 1000000, 1);
        const riskScore = 1 - riskMetrics.riskScore;
        return (volumeScore * 0.6 + riskScore * 0.4);
    }
    calculateConfidence(volumeIncrease, priceIncrease, riskMetrics) {
        const volumeScore = Math.min(volumeIncrease / 500, 1);
        const priceScore = Math.min(priceIncrease / 20, 1);
        const riskScore = 1 - riskMetrics.riskScore;
        return (volumeScore * 0.4 + priceScore * 0.3 + riskScore * 0.3);
    }
    async analyzeMarketCondition(mint) {
        try {
            const metrics = await this.marketAnalysis.analyzeToken(mint);
            if (!metrics) {
                throw new Error('Unable to get token metrics');
            }
            const riskMetrics = await this.marketAnalysis.calculateRiskMetrics(mint);
            if (!riskMetrics) {
                throw new Error('Unable to get risk metrics');
            }
            return {
                mint,
                price: metrics.price,
                volume24h: metrics.volume24h,
                liquidity: metrics.liquidity,
                priceChange24h: metrics.priceChange24h,
                volatility: riskMetrics.volatility,
                riskScore: riskMetrics.riskScore,
                timestamp: Date.now()
            };
        }
        catch (error) {
            this.logger.error('Error analyzing market condition', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T14:44:43Z').toISOString()
            });
            throw error;
        }
    }
    isValidMarketCondition(condition, config) {
        return condition.volume24h >= config.minVolume &&
            condition.liquidity >= config.minLiquidity &&
            condition.riskScore <= config.maxRiskScore;
    }
    async analyzeToken(mint) {
        const signals = [];
        try {
            for (const strategyId of this.activeStrategies) {
                const strategy = this.strategies.get(strategyId);
                if (!strategy)
                    continue;
                const signal = await strategy.analyze(mint);
                if (signal && this.validateSignal(signal)) {
                    signals.push(signal);
                    this.addToSignalHistory(mint, signal);
                }
            }
            this.logger.info('Token analysis completed', {
                mint,
                signalsCount: signals.length,
                strategies: Array.from(this.activeStrategies),
                timestamp: new Date('2025-02-21T14:44:43Z').toISOString()
            });
            return signals;
        }
        catch (error) {
            this.logger.error('Error analyzing token', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T14:47:17Z').toISOString()
            });
            return [];
        }
    }
    validateSignal(signal) {
        if (!signal.mint || !signal.action || !signal.confidence) {
            return false;
        }
        const config = this.getStrategyConfig(signal.strategy);
        return signal.confidence >= config.minConfidence &&
            this.countRecentSignals(signal.mint) < this.MAX_SIGNALS_PER_INTERVAL;
    }
    addToSignalHistory(mint, signal) {
        const history = this.signalHistory.get(mint) || [];
        history.push(signal);
        // Очищаем старые сигналы
        const cutoff = Date.now() - this.SIGNAL_INTERVAL;
        const filteredHistory = history.filter(s => s.timestamp >= cutoff);
        this.signalHistory.set(mint, filteredHistory);
    }
    countRecentSignals(mint) {
        const history = this.signalHistory.get(mint) || [];
        const cutoff = Date.now() - this.SIGNAL_INTERVAL;
        return history.filter(signal => signal.timestamp >= cutoff).length;
    }
    addStrategy(id, strategy) {
        this.strategies.set(id, strategy);
        this.strategyConfigs.set(id, {
            ...this.DEFAULT_CONFIG,
            ...strategy.config
        });
        this.activeStrategies.add(id);
        this.logger.info('Strategy added', {
            strategyId: id,
            name: strategy.name,
            timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
            user: 'klakrketn'
        });
    }
    removeStrategy(id) {
        this.strategies.delete(id);
        this.strategyConfigs.delete(id);
        this.activeStrategies.delete(id);
        this.logger.info('Strategy removed', {
            strategyId: id,
            timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
            user: 'klakrketn'
        });
    }
    enableStrategy(id) {
        if (this.strategies.has(id)) {
            this.activeStrategies.add(id);
            this.logger.info('Strategy enabled', {
                strategyId: id,
                timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
                user: 'klakrketn'
            });
        }
    }
    disableStrategy(id) {
        this.activeStrategies.delete(id);
        this.logger.info('Strategy disabled', {
            strategyId: id,
            timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
            user: 'klakrketn'
        });
    }
    getStrategyConfig(id) {
        return this.strategyConfigs.get(id) || this.DEFAULT_CONFIG;
    }
    updateStrategyConfig(id, config) {
        const currentConfig = this.getStrategyConfig(id);
        this.strategyConfigs.set(id, {
            ...currentConfig,
            ...config
        });
        this.logger.info('Strategy config updated', {
            strategyId: id,
            config: config,
            timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
            user: 'klakrketn'
        });
    }
    getActiveStrategies() {
        return Array.from(this.activeStrategies);
    }
    getSignalHistory(mint) {
        return this.signalHistory.get(mint) || [];
    }
    clearSignalHistory(mint) {
        if (mint) {
            this.signalHistory.delete(mint);
        }
        else {
            this.signalHistory.clear();
        }
        this.logger.info('Signal history cleared', {
            mint: mint || 'all',
            timestamp: new Date('2025-02-21T14:47:17Z').toISOString(),
            user: 'klakrketn'
        });
    }
}
exports.TradingStrategyService = TradingStrategyService;
