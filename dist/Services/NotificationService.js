"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const RateLimiter_1 = require("../utils/RateLimiter");
class NotificationService {
    constructor(logger, maxQueueSize = 1000, processingInterval = 1000) {
        this.logger = logger;
        this.maxQueueSize = maxQueueSize;
        this.processingInterval = processingInterval;
        this.errors = [];
        this.lastHealthCheck = 0;
        this.notificationQueue = [];
        this.channelConfigs = new Map();
        this.isProcessing = false;
        this.startTime = Date.now();
        this.rateLimiter = new RateLimiter_1.RateLimiter(100, 60000); // 100 уведомлений в минуту
        // Инициализация конфигураций каналов по умолчанию
        this.initializeDefaultConfigs();
        this.logger.info('NotificationService initialized', {
            maxQueueSize: this.maxQueueSize,
            processingInterval: this.processingInterval,
            timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
            user: 'klakrketn'
        });
        // Запуск обработчика очереди
        this.startQueueProcessor();
    }
    initializeDefaultConfigs() {
        const defaultConfig = {
            enabled: true,
            retryAttempts: 3,
            retryDelay: 1000,
            rateLimit: {
                maxRequests: 100,
                windowMs: 60000
            },
            priority: 1
        };
        this.channelConfigs.set('email', { ...defaultConfig });
        this.channelConfigs.set('telegram', { ...defaultConfig });
        this.channelConfigs.set('discord', { ...defaultConfig });
        this.channelConfigs.set('slack', { ...defaultConfig });
    }
    async sendNotification(message) {
        try {
            await this.rateLimiter.waitForSlot();
            if (this.notificationQueue.length >= this.maxQueueSize) {
                throw new Error('Notification queue is full');
            }
            const config = this.channelConfigs.get(message.channel);
            if (!config || !config.enabled) {
                throw new Error(`Channel ${message.channel} is not configured or disabled`);
            }
            message.timestamp = message.timestamp || Date.now();
            message.status = 'pending';
            message.retryCount = 0;
            this.notificationQueue.push(message);
            this.logger.debug('Notification queued', {
                messageId: message.id,
                channel: message.channel,
                type: message.type,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            return {
                success: true,
                messageId: message.id,
                status: 'queued',
                timestamp: Date.now()
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Error queueing notification', {
                error: errorMessage,
                messageId: message.id,
                channel: message.channel,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            this.errors.push(new Error(`Failed to queue notification: ${errorMessage}`));
            return {
                success: false,
                messageId: message.id,
                status: 'failed',
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    async getNotificationStatus(messageId) {
        try {
            const message = this.notificationQueue.find(msg => msg.id === messageId);
            if (!message) {
                return {
                    success: false,
                    messageId,
                    status: 'not_found',
                    timestamp: Date.now()
                };
            }
            return {
                success: true,
                messageId,
                status: message.status || 'unknown',
                timestamp: Date.now()
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Error getting notification status', {
                error: errorMessage,
                messageId,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            return {
                success: false,
                messageId,
                status: 'error',
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    async updateNotificationConfig(channel, config) {
        try {
            this.channelConfigs.set(channel, config);
            this.logger.info('Notification config updated', {
                channel,
                config,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            return true;
        }
        catch (error) {
            this.logger.error('Error updating notification config', {
                error: error instanceof Error ? error.message : 'Unknown error',
                channel,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            return false;
        }
    }
    async getNotificationConfig(channel) {
        return this.channelConfigs.get(channel) || null;
    }
    async healthCheck() {
        try {
            const startTime = Date.now();
            // Проверяем состояние каналов уведомлений
            const channelsStatus = Array.from(this.channelConfigs.entries())
                .reduce((acc, [channel, config]) => {
                acc[channel] = config.enabled;
                return acc;
            }, {});
            const result = {
                serviceId: 'NotificationService',
                status: 'healthy',
                timestamp: Date.now(),
                responseTime: Date.now() - startTime,
                details: {
                    queueSize: this.notificationQueue.length,
                    maxQueueSize: this.maxQueueSize,
                    channels: channelsStatus,
                    uptime: Date.now() - this.startTime
                },
                checkedBy: 'klakrketn'
            };
            this.lastHealthCheck = Date.now();
            return result;
        }
        catch (error) {
            return {
                serviceId: 'NotificationService',
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
        return {
            cpuUsage: process.cpuUsage().user,
            memoryUsage: process.memoryUsage().heapUsed,
            networkLatency: 0,
            rpcLatency: 0,
            transactionsPerSecond: this.calculateTPS(),
            pendingTransactions: this.notificationQueue.length,
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
    calculateTPS() {
        const timeWindow = 60000; // 1 минута
        const now = Date.now();
        const recentMessages = this.notificationQueue.filter(msg => msg.timestamp && msg.timestamp > now - timeWindow).length;
        return recentMessages / 60; // Сообщений в секунду
    }
    async startQueueProcessor() {
        setInterval(async () => {
            if (this.isProcessing || this.notificationQueue.length === 0) {
                return;
            }
            this.isProcessing = true;
            try {
                const message = this.notificationQueue[0];
                const config = this.channelConfigs.get(message.channel);
                if (!config || !config.enabled) {
                    this.notificationQueue.shift();
                    return;
                }
                const success = await this.processNotification(message);
                if (success || message.retryCount >= (config.retryAttempts || 3)) {
                    this.notificationQueue.shift();
                }
                else {
                    message.retryCount = (message.retryCount || 0) + 1;
                    message.status = 'retry';
                    // Перемещаем в конец очереди
                    this.notificationQueue.push(this.notificationQueue.shift());
                }
            }
            catch (error) {
                this.logger.error('Error processing notification queue', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                    user: 'klakrketn'
                });
            }
            finally {
                this.isProcessing = false;
            }
        }, this.processingInterval);
    }
    async processNotification(message) {
        try {
            // Здесь должна быть реальная отправка уведомления через соответствующий канал
            switch (message.channel) {
                case 'email':
                    // Реализация отправки email
                    break;
                case 'telegram':
                    // Реализация отправки в Telegram
                    break;
                case 'discord':
                    // Реализация отправки в Discord
                    break;
                case 'slack':
                    // Реализация отправки в Slack
                    break;
            }
            message.status = 'sent';
            return true;
        }
        catch (error) {
            this.logger.error('Error processing notification', {
                error: error instanceof Error ? error.message : 'Unknown error',
                messageId: message.id,
                channel: message.channel,
                timestamp: new Date('2025-02-21T21:18:24Z').toISOString(),
                user: 'klakrketn'
            });
            message.status = 'failed';
            return false;
        }
    }
}
exports.NotificationService = NotificationService;
