"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const telegraf_1 = require("telegraf");
class TelegramService {
    constructor(logger) {
        this.logger = logger;
        this.startTime = Date.now();
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN not found in environment variables');
        }
        if (!process.env.TELEGRAM_CHAT_IDS) {
            throw new Error('TELEGRAM_CHAT_IDS not found in environment variables');
        }
        this.bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        this.chatIds = process.env.TELEGRAM_CHAT_IDS.split(',');
        this.lastHealthCheck = Date.now();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.bot.catch((err) => {
            this.logger.error('Telegram bot error', {
                error: err.message,
                stack: err.stack,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        });
    }
    async notifyTradeSignal(alert) {
        try {
            const message = this.formatTradeSignalMessage(alert);
            await this.broadcastMessage(message);
            this.logger.info('Trade signal notification sent', {
                type: alert.type,
                token: alert.token,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        }
        catch (error) {
            this.handleError('Failed to send trade signal notification', error);
        }
    }
    async notifyError(error, context) {
        try {
            const message = this.formatErrorMessage(error, context);
            await this.broadcastMessage(message);
            this.logger.error('Error notification sent', {
                error: error.message,
                context,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        }
        catch (err) {
            this.handleError('Failed to send error notification', err);
        }
    }
    async notifyWarning(message, metadata) {
        try {
            const formattedMessage = this.formatWarningMessage(message, metadata);
            await this.broadcastMessage(formattedMessage);
            this.logger.warn('Warning notification sent', {
                message,
                metadata,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        }
        catch (error) {
            this.handleError('Failed to send warning notification', error);
        }
    }
    async notifyInfo(message, metadata) {
        try {
            const formattedMessage = this.formatInfoMessage(message, metadata);
            await this.broadcastMessage(formattedMessage);
            this.logger.info('Info notification sent', {
                message,
                metadata,
                timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
                user: 'klakrketn'
            });
        }
        catch (error) {
            this.handleError('Failed to send info notification', error);
        }
    }
    async healthCheck() {
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
        }
        catch (error) {
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
    async getServiceHealth() {
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
    async broadcastMessage(message) {
        const promises = this.chatIds.map(chatId => this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }));
        await Promise.all(promises);
    }
    formatTradeSignalMessage(alert) {
        return `
🚨 <b>${alert.type} Alert</b>

Token: ${alert.token}
Amount: ${alert.amount}
${alert.confidence ? `Confidence: ${(alert.confidence * 100).toFixed(2)}%` : ''}
${alert.strategy ? `Strategy: ${alert.strategy}` : ''}

${alert.reason ? `Reason: ${alert.reason.join(', ')}` : ''}
        `.trim();
    }
    formatErrorMessage(error, context) {
        return `
❌ <b>Error Alert</b>

Message: ${error.message}
${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }
    formatWarningMessage(message, metadata) {
        return `
⚠️ <b>Warning</b>

Message: ${message}
${metadata ? `Details: ${JSON.stringify(metadata, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }
    formatInfoMessage(message, metadata) {
        return `
ℹ️ <b>Info</b>

Message: ${message}
${metadata ? `Details: ${JSON.stringify(metadata, null, 2)}` : ''}
Time: ${new Date('2025-02-21T20:24:34Z').toISOString()}
        `.trim();
    }
    handleError(message, error) {
        this.logger.error(message, {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date('2025-02-21T20:24:34Z').toISOString(),
            user: 'klakrketn'
        });
    }
}
exports.TelegramService = TelegramService;
