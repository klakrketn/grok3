import * as winston from 'winston';
import { Telegraf } from 'telegraf';
import {
    TelegramAlert,
    ServiceHealth,
    HealthCheckResult,
    Constants
} from '../types/PumpFunTypes';
import { ITelegramService } from '../interfaces/IServices';

export class TelegramService implements ITelegramService {
    private bot: Telegraf;
    private chatIds: string[];
    private lastHealthCheck: number;
    private readonly startTime: number;
    public readonly logger: winston.Logger;

    constructor(logger: winston.Logger) {
        this.logger = logger;
        this.startTime = Date.now();
        
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN not found in environment variables');
        }
        
        if (!process.env.TELEGRAM_CHAT_IDS) {
            throw new Error('TELEGRAM_CHAT_IDS not found in environment variables');
        }

        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        this.chatIds = process.env.TELEGRAM_CHAT_IDS.split(',');
        this.lastHealthCheck = Date.now();

        this.setupErrorHandling();
    }

    private setupErrorHandling(): void {
        this.bot.catch((err: Error) => {
            this.logger.error('Telegram bot error', {
                error: err.message,
                stack: err.stack,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        });
    }

    public async notifyTradeSignal(alert: TelegramAlert): Promise<void> {
        try {
            const message = this.formatTradeSignalMessage(alert);
            await this.broadcastMessage(message);
            
            this.logger.info('Trade signal notification sent', {
                type: alert.type,
                token: alert.token,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (error) {
            this.handleError('Failed to send trade signal notification', error);
        }
    }

    public async notifyError(error: Error, context?: Record<string, any>): Promise<void> {
        try {
            const message = this.formatErrorMessage(error, context);
            await this.broadcastMessage(message);
            
            this.logger.error('Error notification sent', {
                error: error.message,
                context,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (err) {
            this.handleError('Failed to send error notification', err);
        }
    }

    public async notifyWarning(message: string, metadata?: Record<string, any>): Promise<void> {
        try {
            const formattedMessage = this.formatWarningMessage(message, metadata);
            await this.broadcastMessage(formattedMessage);
            
            this.logger.warn('Warning notification sent', {
                message,
                metadata,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (error) {
            this.handleError('Failed to send warning notification', error);
        }
    }

    public async notifyInfo(message: string, metadata?: Record<string, any>): Promise<void> {
        try {
            const formattedMessage = this.formatInfoMessage(message, metadata);
            await this.broadcastMessage(formattedMessage);
            
            this.logger.info('Info notification sent', {
                message,
                metadata,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (error) {
            this.handleError('Failed to send info notification', error);
        }
    }

    public async healthCheck(): Promise<HealthCheckResult> {
        try {
            const startTime = Date.now();
            await this.bot.telegram.getMe();
            const responseTime = Date.now() - startTime;

            this.lastHealthCheck = Date.now();

            return {
                serviceId: 'TelegramService',
                status: 'healthy',
                timestamp: Date.now(),
                responseTime,
                checkedBy: 'klakrketn'
            };
        } catch (error) {
            return {
                serviceId: 'TelegramService',
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
        const uptime = Date.now() - this.startTime;
        const healthCheck = await this.healthCheck();

        return {
            isHealthy: healthCheck.status === 'healthy',
            lastCheck: this.lastHealthCheck,
            errors: [], // Здесь должен быть массив последних ошибок
            performance: {
                cpuUsage: process.cpuUsage().user,
                memoryUsage: process.memoryUsage().heapUsed,
                networkLatency: healthCheck.responseTime,
                rpcLatency: 0,
                transactionsPerSecond: 0,
                pendingTransactions: 0,
                lastBlockProcessingTime: 0,
                timestamp: Date.now(),
                collector: 'klakrketn'
            },
            status: {
                isHealthy: healthCheck.status === 'healthy',
                lastCheck: this.lastHealthCheck,
                errors: [],
                metrics: {
                    requestsPerMinute: 0,
                    averageResponseTime: healthCheck.responseTime,
                    errorRate: 0,
                    lastUpdated: Date.now(),
                    updatedBy: 'klakrketn'
                }
            }
        };
    }

    private async broadcastMessage(message: string): Promise<void> {
        const promises = this.chatIds.map(chatId =>
            this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
        );

        await Promise.all(promises);
    }

    private formatTradeSignalMessage(alert: TelegramAlert): string {
        return `
🚨 <b>${alert.type} Alert</b>

Token: ${alert.token}
Amount: ${alert.amount}
${alert.confidence ? `Confidence: ${(alert.confidence * 100).toFixed(2)}%` : ''}
${alert.strategy ? `Strategy: ${alert.strategy}` : ''}

${alert.reason ? `Reason: ${alert.reason.join(', ')}` : ''}
        `.trim();
    }

    private formatErrorMessage(error: Error, context?: Record<string, any>): string {
        return `
❌ <b>Error Alert</b>

Message: ${error.message}
${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }

    private formatWarningMessage(message: string, metadata?: Record<string, any>): string {
        return `
⚠️ <b>Warning</b>

Message: ${message}
${metadata ? `Details: ${JSON.stringify(metadata, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }

    private formatInfoMessage(message: string, metadata?: Record<string, any>): string {
        return `
ℹ️ <b>Info</b>

Message: ${message}
${metadata ? `Details: ${JSON.stringify(metadata, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }

    private handleError(message: string, error: unknown): void {
        this.logger.error(message, {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
            user: 'klakrketn'
        });
    }
}