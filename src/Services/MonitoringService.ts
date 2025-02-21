import * as winston from 'winston';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
    TokenMetrics, 
    AlertConfig, 
    AlertType, 
    MonitoringStatus,
    ServiceHealth,
    HealthCheckResult,
    PerformanceMetrics,
    ErrorLog
} from '../types/PumpFunTypes';
import { MarketAnalysisService } from './MarketAnalysisService';
import { RateLimiter } from '../utils/RateLimiter';
import { IMonitoringService } from '../interfaces/IServices';

interface Alert {
    id: string;
    type: AlertType;
    mint: string;
    condition: string;
    threshold: number;
    triggered: boolean;
    timestamp: number;
    value: number;
}

export class MonitoringService implements IMonitoringService {
    private readonly alerts: Map<string, Alert>;
    private readonly monitoredTokens: Set<string>;
    private readonly statusHistory: Map<string, MonitoringStatus[]>;
    private readonly rateLimiter: RateLimiter;
    private readonly checkInterval: NodeJS.Timer;
    private readonly HISTORY_LIMIT = 1000;
    private readonly CHECK_INTERVAL = 30000; // 30 секунд
    private readonly ALERT_THROTTLE = 5 * 60 * 1000; // 5 минут
    private lastAlertTime: Map<string, number>;
    private readonly startTime: number;
    private metrics: Map<string, number[]>;
    private errors: ErrorLog[];
    private lastMetricCleanup: number;

    constructor(
        private readonly connection: Connection,
        private readonly marketAnalysis: MarketAnalysisService,
        public readonly logger: winston.Logger
    ) {
        this.alerts = new Map();
        this.monitoredTokens = new Set();
        this.statusHistory = new Map();
        this.lastAlertTime = new Map();
        this.metrics = new Map();
        this.errors = [];
        this.startTime = Date.now();
        this.lastMetricCleanup = Date.now();
        
        // 120 запросов в минуту для мониторинга
        this.rateLimiter = new RateLimiter(120, 60000);

        this.checkInterval = setInterval(
            () => this.checkAlerts(),
            this.CHECK_INTERVAL
        );

        // Добавляем периодическую очистку метрик
        setInterval(() => this.cleanupOldMetrics(), 3600000); // Каждый час

        this.logger.info('MonitoringService initialized', {
            checkInterval: this.CHECK_INTERVAL,
            historyLimit: this.HISTORY_LIMIT,
            alertThrottle: this.ALERT_THROTTLE,
            timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
            user: 'klakrketn'
        });
    }

    // Имплементация методов IMonitoringService
    public recordMetric(name: string, value: number): void {
        try {
            if (!this.metrics.has(name)) {
                this.metrics.set(name, []);
            }
            
            const metricArray = this.metrics.get(name)!;
            metricArray.push(value);

            this.logger.debug(`Recorded metric: ${name}`, {
                value,
                timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (error) {
            this.handleError('Failed to record metric', error);
        }
    }

    public recordError(error: Error, context?: Record<string, any>): void {
        try {
            const errorLog: ErrorLog = {
                id: Math.random().toString(36).substring(7),
                timestamp: Date.now(),
                level: 'ERROR',
                message: error.message,
                context: {
                    service: context?.service || 'unknown',
                    method: context?.method || 'unknown',
                    params: context?.params,
                    error: error.stack
                },
                stack: error.stack,
                resolved: false
            };

            this.errors.push(errorLog);
            this.logger.error('Error recorded', {
                errorId: errorLog.id,
                message: error.message,
                context,
                timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (err) {
            this.handleError('Failed to record error', err);
        }
    }

    public async getMetrics(): Promise<Record<string, number>> {
        try {
            const result: Record<string, number> = {};
            
            for (const [name, values] of this.metrics.entries()) {
                if (values.length > 0) {
                    result[name] = values.reduce((a, b) => a + b, 0) / values.length;
                }
            }

            return result;
        } catch (error) {
            this.handleError('Failed to get metrics', error);
            return {};
        }
    }

    public async checkPerformance(): Promise<boolean> {
        try {
            const metrics = await this.getPerformanceMetrics();
            const isHealthy = this.evaluatePerformance(metrics);

            if (!isHealthy) {
                this.logger.warn('Performance check failed', {
                    metrics,
                    timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
                    user: 'klakrketn'
                });
            }

            return isHealthy;
        } catch (error) {
            this.handleError('Failed to check performance', error);
            return false;
        }
    }

    public async healthCheck(): Promise<HealthCheckResult> {
        try {
            const startTime = Date.now();
            const metrics = await this.getMetrics();
            const responseTime = Date.now() - startTime;

            return {
                serviceId: 'MonitoringService',
                status: 'healthy',
                timestamp: Date.now(),
                responseTime,
                details: { metrics },
                checkedBy: 'klakrketn'
            };
        } catch (error) {
            return {
                serviceId: 'MonitoringService',
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
        const metrics = await this.getPerformanceMetrics();
        const healthCheck = await this.healthCheck();

        return {
            isHealthy: healthCheck.status === 'healthy',
            lastCheck: Date.now(),
            errors: this.errors.slice(-10), // Последние 10 ошибок
            performance: metrics,
            status: {
                isHealthy: healthCheck.status === 'healthy',
                lastCheck: Date.now(),
                errors: this.errors,
                metrics: {
                    requestsPerMinute: this.calculateRequestsPerMinute(),
                    averageResponseTime: this.calculateAverageResponseTime(),
                    errorRate: this.calculateErrorRate(),
                    lastUpdated: Date.now(),
                    updatedBy: 'klakrketn'
                }
            }
        };
    }

    // Существующие методы из вашего кода
    public async addToken(mint: string): Promise<boolean> {
        try {
            await this.rateLimiter.waitForSlot();

            const tokenInfo = await this.connection.getTokenSupply(new PublicKey(mint));
            if (!tokenInfo.value) {
                throw new Error('Invalid token mint address');
            }

            this.monitoredTokens.add(mint);
            this.statusHistory.set(mint, []);

            this.logger.info('Token added to monitoring', {
                mint,
                timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
                user: 'klakrketn'
            });

            return true;

        } catch (error) {
            this.handleError('Error adding token to monitoring', error);
            return false;
        }
    }

    public removeToken(mint: string): void {
        this.monitoredTokens.delete(mint);
        this.statusHistory.delete(mint);
        
        for (const [alertId, alert] of this.alerts.entries()) {
            if (alert.mint === mint) {
                this.alerts.delete(alertId);
            }
        }

        this.logger.info('Token removed from monitoring', {
            mint,
            timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
            user: 'klakrketn'
        });
    }

    public addAlert(config: AlertConfig): string {
        const alertId = this.generateAlertId();
        const alert: Alert = {
            id: alertId,
            type: config.type,
            mint: config.mint,
            condition: config.condition,
            threshold: config.threshold,
            triggered: false,
            timestamp: Date.now(),
            value: 0
        };

        this.alerts.set(alertId, alert);

        if (!this.monitoredTokens.has(config.mint)) {
            this.addToken(config.mint);
        }

        this.logger.info('Alert added', {
            alertId,
            config,
            timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
            user: 'klakrketn'
        });

        return alertId;
    }

    public removeAlert(alertId: string): void {
        this.alerts.delete(alertId);
        this.logger.info('Alert removed', {
            alertId,
            timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
            user: 'klakrketn'
        });
    }

    private async checkAlerts(): Promise<void> {
        try {
            for (const mint of this.monitoredTokens) {
                await this.rateLimiter.waitForSlot();

                const metrics = await this.marketAnalysis.analyzeToken(mint);
                if (!metrics) continue;

                this.updateStatusHistory(mint, metrics);
                await this.checkAlertsForToken(mint, metrics);
            }
        } catch (error) {
            this.handleError('Error checking alerts', error);
        }
    }

    private async checkAlertsForToken(mint: string, metrics: TokenMetrics): Promise<void> {
        const now = Date.now();
        const relevantAlerts = Array.from(this.alerts.values())
            .filter(alert => alert.mint === mint);

        for (const alert of relevantAlerts) {
            try {
                const lastAlertTime = this.lastAlertTime.get(alert.id) || 0;
                if (now - lastAlertTime < this.ALERT_THROTTLE) {
                    continue;
                }

                const isTriggered = await this.checkAlertCondition(alert, metrics);
                
                if (isTriggered && !alert.triggered) {
                    alert.triggered = true;
                    alert.value = this.getAlertValue(alert, metrics);
                    this.lastAlertTime.set(alert.id, now);
                    
                    await this.handleAlertTrigger(alert, metrics);
                } else if (!isTriggered && alert.triggered) {
                    alert.triggered = false;
                }

            } catch (error) {
                this.handleError('Error checking alert condition', error);
            }
        }
    }

    private async checkAlertCondition(alert: Alert, metrics: TokenMetrics): Promise<boolean> {
        const value = this.getAlertValue(alert, metrics);
        
        switch (alert.condition) {
            case '>':
                return value > alert.threshold;
            case '<':
                return value < alert.threshold;
            case '>=':
                return value >= alert.threshold;
            case '<=':
                return value <= alert.threshold;
            case '==':
                return Math.abs(value - alert.threshold) < 0.0001;
            default:
                return false;
        }
    }

    private getAlertValue(alert: Alert, metrics: TokenMetrics): number {
        switch (alert.type) {
            case 'PRICE':
                return metrics.price;
            case 'VOLUME':
                return metrics.volume24h;
            case 'PRICE_CHANGE':
                return metrics.priceChange24h;
            case 'LIQUIDITY':
                return metrics.liquidity;
            default:
                return 0;
        }
    }

    private async handleAlertTrigger(alert: Alert, metrics: TokenMetrics): Promise<void> {
        this.logger.info('Alert triggered', {
            alert,
            metrics,
            timestamp: new Date('2025-02-21T20:37:53Z').toISOString(),
            user: 'klakrketn'
        });
    }

    private updateStatusHistory(mint: string, metrics: TokenMetrics): void {
        const history = this.statusHistory.get(mint) || [];
        
        history.push({
            timestamp: Date.now(),
            price: metrics.price,
            volume24h: metrics.volume24h,
            priceChange24h: metrics.priceChange24h,
            liquidity: metrics.liquidity
        });

        if (history.length > this.HISTORY_LIMIT) {
            history.shift();
        }

        this.statusHistory.set(mint, history);
    }

    public getAlerts(mint?: string): Alert[] {
        const allAlerts = Array.from(this.alerts.values());
        return mint ? allAlerts.filter(alert => alert.mint === mint) : allAlerts;
    }

    public getStatusHistory(mint: string): MonitoringStatus[] {
        return this.statusHistory.get(mint) || [];
    }

    public getMonitoredTokens(): string[] {
        return Array.from(this.monitoredTokens);
    }

    private generateAlertId(): string {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Вспомогательные методы для мониторинга производительности
    private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
        const startTime = Date.now();
        const [slot, blockTime] = await Promise.all([
            this.connection.getSlot(),
            this.connection.getBlockTime(await this.connection.getSlot())
        ]);

        return {
            cpuUsage: process.cpuUsage().user,
            memoryUsage: process.memoryUsage().heapUsed,
            networkLatency: Date.now() - startTime,
            rpcLatency: Date.now() - startTime,
            transactionsPerSecond: await this.calculateTPS(),
            pendingTransactions: 0,
            lastBlockProcessingTime: blockTime ? Date.now() - (blockTime * 1000) : 0,
            timestamp: Date.now(),
            collector: 'klakrketn'
        };
    }

    private evaluatePerformance(metrics: PerformanceMetrics): boolean {
        const thresholds = {
            maxCpuUsage: 90, // 90%
            maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
            maxNetworkLatency: 1000, // 1 second
            maxRpcLatency: 1000, // 1 second
            minTPS: 1000 // Минимальный TPS
        };

        return (
            metrics.cpuUsage < thresholds.maxCpuUsage &&
            metrics.memoryUsage < thresholds.maxMemoryUsage &&
            metrics.networkLatency < thresholds.maxNetworkLatency &&
            metrics.rpcLatency < thresholds.maxRpcLatency &&
            metrics.transactionsPerSecond > thresholds.minTPS
        );
    }

    private async calculateTPS(): Promise<number> {
        try {
            const performance = await this.connection.getRecentPerformanceSamples(1);
            if (performance.length > 0) {
                return performance[0].numTransactions / performance[0].samplePeriodSecs;
            }
            return 0;
        } catch (error) {
            this.handleError('Failed to calculate TPS', error);
            return 0;
        }
    }

    private calculateRequestsPerMinute(): number {
        const oneMinuteAgo = Date.now() - 60000;
        const recentRequests = Array.from(this.metrics.values())
            .flat()
            .filter(timestamp => timestamp > oneMinuteAgo);
        return recentRequests.length;
    }

    private calculateAverageResponseTime(): number {
        if (!this.metrics.has('responseTime')) return 0;
        const responseTimes = this.metrics.get('responseTime')!;
        if (responseTimes.length === 0) return 0;
        return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    private calculateErrorRate(): number {
        const recentErrors = this.errors.filter(
            error => error.timestamp > Date.now() - 60000
        ).length;
        return recentErrors / 60; // Ошибок в секунду
    }

    private cleanupOldMetrics(): void {
        const now = Date.now();
        const cutoff = now - 3600000; // 1 час

        for (const [name, values] of this.metrics.entries()) {
            this.metrics.set(
                name,
                values.filter(value => value > cutoff)
            );
        }

        this.errors = this.errors.filter(error => error.timestamp > cutoff);
        this.lastMetricCleanup = now;
    }

    private handleError(message: string, error: unknown): void {
        this.logger.error(message, {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date('2025-02-21T20:42:15Z').toISOString(),
            user: 'klakrketn'
        });
    }

    public stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.logger.info('Monitoring service stopped', {
            timestamp: new Date('2025-02-21T20:42:15Z').toISOString(),
            user: 'klakrketn'
        });
    }
}