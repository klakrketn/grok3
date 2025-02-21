import * as winston from 'winston';
import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';
import { TransactionData, WalletAnalysis, WalletMetrics, RiskMetrics } from '../types/PumpFunTypes';

export class AnalysisService {
    private readonly ANALYSIS_WINDOW = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
    private readonly MIN_TRADES = 3; // Минимальное количество сделок для анализа
    private readonly SCORE_WEIGHTS = {
        volume: 0.3,
        profit: 0.2,
        successRate: 0.2,
        frequency: 0.15,
        age: 0.15
    };

    constructor(
        private logger: winston.Logger,
        private connection: Connection
    ) {}

    async analyzeTransactions(transactions: TransactionData[]): Promise<WalletAnalysis[]> {
        this.logger.info('Starting transaction analysis...', { 
            transactionCount: transactions.length,
            timestamp: new Date().toISOString()
        });

        const walletMap = new Map<string, {
            trades: number;
            volume: number;
            profit: number;
            lastTradeTime: number;
            tokens: Set<string>;
            buyVolume: number;
            sellVolume: number;
            successfulTrades: number;
            failedTrades: number;
            firstTradeTime: number;
            tradeAmounts: number[];
        }>();

        // Группировка транзакций по кошелькам
        for (const tx of transactions) {
            try {
                await this.processTransaction(tx, walletMap);
            } catch (error) {
                this.logger.error('Error processing transaction', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    signature: tx.signature
                });
                continue;
            }
        }

        // Анализ каждого кошелька
        const analyses: WalletAnalysis[] = [];
        let processedWallets = 0;

        for (const [address, data] of walletMap.entries()) {
            try {
                const analysis = await this.analyzeWallet(address, data);
                if (analysis) {
                    analyses.push(analysis);
                }
                processedWallets++;
            } catch (error) {
                this.logger.error('Error analyzing wallet', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    address
                });
            }
        }

        this.logger.info('Wallet analysis completed', { analyzedCount: processedWallets });
        return analyses;
    }

    private async processTransaction(
        tx: TransactionData, 
        walletMap: Map<string, any>
    ): Promise<void> {
        const now = Date.now();
        const wallet = tx.accountKeys[0];
        
        if (!walletMap.has(wallet)) {
            walletMap.set(wallet, {
                trades: 0,
                volume: 0,
                profit: 0,
                lastTradeTime: 0,
                tokens: new Set(),
                buyVolume: 0,
                sellVolume: 0,
                successfulTrades: 0,
                failedTrades: 0,
                firstTradeTime: tx.blockTime * 1000,
                tradeAmounts: []
            });
        }

        const stats = walletMap.get(wallet)!;
        stats.trades++;
        stats.lastTradeTime = Math.max(stats.lastTradeTime, tx.blockTime * 1000);

        for (const transfer of tx.tokenTransfers) {
            try {
                const amountInSol = parseFloat(transfer.amount) / 1e9;
                stats.tradeAmounts.push(amountInSol);
                stats.tokens.add(transfer.mint);

                if (transfer.fromUserAccount === wallet) {
                    stats.sellVolume += amountInSol;
                    stats.volume += amountInSol;
                } else if (transfer.toUserAccount === wallet) {
                    stats.buyVolume += amountInSol;
                    stats.volume += amountInSol;
                }

                // Определяем успешность сделки
                if (amountInSol > 0) {
                    stats.successfulTrades++;
                } else {
                    stats.failedTrades++;
                }
            } catch (error) {
                this.logger.error('Error processing transfer', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    transfer
                });
            }
        }
    }

    private async analyzeWallet(
        address: string, 
        data: any
    ): Promise<WalletAnalysis | null> {
        try {
            // Получаем баланс кошелька
            const balance = await this.connection.getBalance(new PublicKey(address));
            const balanceInSol = balance / 1e9;

            // Расчет метрик
            const metrics = this.calculateWalletMetrics(data, balanceInSol);
            const riskMetrics = this.calculateRiskMetrics(data);
            
            // Расчет общего скора
            const score = this.calculateScore(metrics, riskMetrics);

            // Определение категории кошелька
            const category = this.categorizeWallet(metrics, riskMetrics);
            
            // Анализ подозрительности
            const isSuspicious = this.checkSuspiciousActivity(metrics, riskMetrics);

            // Формируем инсайты
            const insights = this.generateInsights(metrics, riskMetrics);

            return {
                address,
                balance: balanceInSol,
                totalTrades: data.trades,
                successRate: riskMetrics.successRate,
                profitLoss: data.buyVolume - data.sellVolume,
                uniqueTokens: data.tokens.size,
                recentActivity: this.getActivityLevel(metrics.tradeFrequency),
                tradingVolume24h: metrics.tradingVolume24h,
                averageTradeSize: metrics.averageTradeSize,
                largestTrade: metrics.largestTrade,
                tradeFrequency: metrics.tradeFrequency,
                lastTradeTime: data.lastTradeTime,
                tokenLiquidity: await this.getTokenLiquidity(Array.from(data.tokens)),
                score,
                category,
                flags: this.generateFlags(metrics, riskMetrics),
                insights,
                metrics,
                riskMetrics,
                isSuspicious
            };

        } catch (error) {
            this.logger.error('Error analyzing wallet', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address
            });
            return null;
        }
    }

    private calculateWalletMetrics(data: any, balance: number): WalletMetrics {
        const now = Date.now();
        const age = now - data.firstTradeTime;
        const volume24h = data.tradeAmounts
            .filter((_, i) => now - data.lastTradeTime + i * 60000 < this.ANALYSIS_WINDOW)
            .reduce((sum: number, amount: number) => sum + amount, 0);

        return {
            tradingVolume24h: volume24h,
            totalTrades: data.trades,
            successRate: data.successfulTrades / (data.successfulTrades + data.failedTrades),
            profitLoss: data.buyVolume - data.sellVolume,
            averageTradeSize: data.tradeAmounts.reduce((a: number, b: number) => a + b, 0) / data.tradeAmounts.length,
            tradeFrequency: data.trades / (age / (24 * 60 * 60 * 1000)),
            uniqueTokens: data.tokens.size,
            largestTrade: Math.max(...data.tradeAmounts),
            balance,
            age,
            lastTradeTime: data.lastTradeTime
        };
    }

    private calculateRiskMetrics(data: any): RiskMetrics {
        const tradeAmounts = data.tradeAmounts;
        const mean = tradeAmounts.reduce((a: number, b: number) => a + b, 0) / tradeAmounts.length;
        const variance = tradeAmounts.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / tradeAmounts.length;
        const volatility = Math.sqrt(variance);

        return {
            volatility,
            sharpeRatio: (data.buyVolume - data.sellVolume) / volatility,
            maxDrawdown: this.calculateMaxDrawdown(tradeAmounts),
            successRate: data.successfulTrades / (data.successfulTrades + data.failedTrades),
            failureRate: data.failedTrades / (data.successfulTrades + data.failedTrades),
            riskScore: this.calculateRiskScore(volatility, data.trades, data.volume)
        };
    }

    private calculateMaxDrawdown(tradeAmounts: number[]): number {
        let maxDrawdown = 0;
        let peak = -Infinity;
        let runningSum = 0;

        for (const amount of tradeAmounts) {
            runningSum += amount;
            if (runningSum > peak) {
                peak = runningSum;
            }
            const drawdown = peak - runningSum;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        return maxDrawdown;
    }

    private calculateScore(metrics: WalletMetrics, riskMetrics: RiskMetrics): number {
        const volumeScore = Math.min(metrics.tradingVolume24h / 100, 1) * this.SCORE_WEIGHTS.volume;
        const profitScore = Math.min(Math.max(metrics.profitLoss / metrics.tradingVolume24h, 0), 1) * this.SCORE_WEIGHTS.profit;
        const successScore = riskMetrics.successRate * this.SCORE_WEIGHTS.successRate;
        const frequencyScore = Math.min(metrics.tradeFrequency / 10, 1) * this.SCORE_WEIGHTS.frequency;
        const ageScore = Math.min(metrics.age / (30 * 24 * 60 * 60 * 1000), 1) * this.SCORE_WEIGHTS.age;

        return volumeScore + profitScore + successScore + frequencyScore + ageScore;
    }

    private async getTokenLiquidity(tokens: string[]): Promise<{ [key: string]: number }> {
        const liquidity: { [key: string]: number } = {};
        for (const token of tokens) {
            try {
                // Здесь должна быть логика получения ликвидности токена через Jupiter API или Raydium API
                const tokenInfo = await this.connection.getTokenSupply(new PublicKey(token));
                if (tokenInfo.value.uiAmount !== null) {
                    liquidity[token] = tokenInfo.value.uiAmount;
                } else {
                    liquidity[token] = 0;
                }
            } catch (error) {
                this.logger.error('Error fetching token liquidity', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    token
                });
                liquidity[token] = 0;
            }
        }
        return liquidity;
    }

    private getActivityLevel(frequency: number): string {
        if (frequency >= 10) return 'Very High';
        if (frequency >= 5) return 'High';
        if (frequency >= 1) return 'Medium';
        if (frequency > 0) return 'Low';
        return 'Inactive';
    }

    private categorizeWallet(metrics: WalletMetrics, riskMetrics: RiskMetrics): string {
        if (metrics.tradingVolume24h > 1000 && riskMetrics.successRate > 0.7) return 'Whale';
        if (metrics.tradeFrequency > 5 && metrics.profitLoss > 0) return 'Active Trader';
        if (metrics.uniqueTokens > 10) return 'Token Collector';
        if (riskMetrics.riskScore > 0.7) return 'High Risk';
        return 'Regular';
    }

    private generateFlags(metrics: WalletMetrics, riskMetrics: RiskMetrics): string[] {
        const flags: string[] = [];
        
        if (metrics.tradingVolume24h > 1000) flags.push('High Volume');
        if (riskMetrics.riskScore > 0.7) flags.push('High Risk');
        if (metrics.tradeFrequency > 10) flags.push('Frequent Trader');
        if (riskMetrics.successRate < 0.3) flags.push('Low Success Rate');
        if (metrics.age < 24 * 60 * 60 * 1000) flags.push('New Wallet');
        if (metrics.balance > 100) flags.push('Whale');
        if (metrics.profitLoss > 10) flags.push('Profitable');
        if (metrics.uniqueTokens > 20) flags.push('Portfolio Diversified');
        
        return flags;
    }

    private generateInsights(metrics: WalletMetrics, riskMetrics: RiskMetrics): string[] {
        const insights: string[] = [];
        
        if (metrics.profitLoss > 0) {
            insights.push(`Profitable trader with ${(riskMetrics.successRate * 100).toFixed(1)}% success rate`);
        }
        
        if (metrics.tradeFrequency > 5) {
            insights.push(`Active trader with ${metrics.tradeFrequency.toFixed(1)} trades per day`);
        }
        
        if (riskMetrics.volatility > 1) {
            insights.push('High volatility in trade sizes');
        }
        
        if (metrics.uniqueTokens > 10) {
            insights.push(`Diverse portfolio with ${metrics.uniqueTokens} different tokens`);
        }

        if (metrics.balance > 100) {
            insights.push(`Significant balance of ${metrics.balance.toFixed(2)} SOL`);
        }

        if (riskMetrics.maxDrawdown > 10) {
            insights.push(`High risk trader with ${riskMetrics.maxDrawdown.toFixed(2)} SOL max drawdown`);
        }

        if (metrics.age < 24 * 60 * 60 * 1000) {
            insights.push('New wallet, exercise caution');
        }
        
        return insights;
    }

    private calculateRiskScore(volatility: number, trades: number, volume: number): number {
        const volScore = Math.min(volatility / 10, 1);
        const tradeScore = Math.min(trades / 100, 1);
        const volumeScore = Math.min(volume / 1000, 1);
        
        return (volScore * 0.4 + tradeScore * 0.3 + volumeScore * 0.3);
    }

    private checkSuspiciousActivity(metrics: WalletMetrics, riskMetrics: RiskMetrics): boolean {
        return (
            riskMetrics.riskScore > 0.8 ||
            metrics.tradeFrequency > 20 ||
            riskMetrics.volatility > 5 ||
            metrics.age < 12 * 60 * 60 * 1000 || // менее 12 часов
            riskMetrics.maxDrawdown > 50 || // большой максимальный убыток
            (metrics.tradingVolume24h > 1000 && metrics.age < 24 * 60 * 60 * 1000) || // Высокий объем для нового кошелька
            (metrics.successfulTrades === 0 && metrics.failedTrades > 5) || // Только неудачные сделки
            (metrics.largestTrade > metrics.balance * 0.9) // Подозрительно большая сделка
        );
    }

    async getWalletStats(address: string): Promise<{
        dailyStats: { volume: number; trades: number; profit: number }[];
        topTokens: { mint: string; volume: number }[];
    }> {
        try {
            const pubkey = new PublicKey(address);
            const dailyStats: { volume: number; trades: number; profit: number }[] = [];
            const tokenVolumes = new Map<string, number>();

            // Получаем историю транзакций за последние 7 дней
            const signatures = await this.connection.getSignaturesForAddress(
                pubkey,
                { limit: 1000 }
            );

            const transactions = await Promise.all(
                signatures.map(sig => 
                    this.connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 })
                )
            );

            // Группируем транзакции по дням
            const txsByDay = new Map<string, any[]>();
            
            transactions.forEach(tx => {
                if (!tx?.blockTime) return;
                
                const date = new Date(tx.blockTime * 1000).toISOString().split('T')[0];
                if (!txsByDay.has(date)) {
                    txsByDay.set(date, []);
                }
                txsByDay.get(date)!.push(tx);

                // Собираем статистику по токенам
                if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
                    const tokenChanges = this.calculateTokenChanges(
                        tx.meta.preTokenBalances,
                        tx.meta.postTokenBalances
                    );
                    
                    tokenChanges.forEach((change, mint) => {
                        tokenVolumes.set(mint, (tokenVolumes.get(mint) || 0) + Math.abs(change));
                    });
                }
            });

            // Формируем дневную статистику
            for (const [date, txs] of txsByDay.entries()) {
                const stats = {
                    volume: 0,
                    trades: txs.length,
                    profit: 0
                };

                txs.forEach(tx => {
                    if (tx.meta?.preBalances && tx.meta?.postBalances) {
                        const balanceChange = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
                        stats.volume += Math.abs(balanceChange);
                        stats.profit += balanceChange;
                    }
                });

                dailyStats.push(stats);
            }

            // Сортируем токены по объему
            const topTokens = Array.from(tokenVolumes.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([mint, volume]) => ({ mint, volume }));

            return { dailyStats, topTokens };

        } catch (error) {
            this.logger.error('Error getting wallet stats', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address
            });
            return {
                dailyStats: [],
                topTokens: []
            };
        }
    }

    private calculateTokenChanges(
        preBalances: any[],
        postBalances: any[]
    ): Map<string, number> {
        const changes = new Map<string, number>();

        preBalances.forEach(pre => {
            const post = postBalances.find(p => p.mint === pre.mint);
            if (post) {
                const change = (post.uiTokenAmount.uiAmount || 0) - (pre.uiTokenAmount.uiAmount || 0);
                changes.set(pre.mint, change);
            }
        });

        return changes;
    }
}
                