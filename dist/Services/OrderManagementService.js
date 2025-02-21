"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderManagementService = void 0;
const RateLimiter_1 = require("../utils/RateLimiter");
class OrderManagementService {
    constructor(connection, marketAnalysis, riskManagement, logger) {
        this.connection = connection;
        this.marketAnalysis = marketAnalysis;
        this.riskManagement = riskManagement;
        this.logger = logger;
        this.EXECUTION_INTERVAL = 1000; // 1 секунда
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 1000; // 1 секунда
        this.MAX_CONCURRENT_ORDERS = 10;
        this.orders = new Map();
        this.orderBooks = new Map();
        this.pendingOrders = new Set();
        // 100 запросов в минуту для управления ордерами
        this.rateLimiter = new RateLimiter_1.RateLimiter(100, 60000);
        this.executionInterval = setInterval(() => this.processPendingOrders(), this.EXECUTION_INTERVAL);
        this.logger.info('OrderManagementService initialized', {
            maxConcurrentOrders: this.MAX_CONCURRENT_ORDERS,
            executionInterval: this.EXECUTION_INTERVAL,
            maxRetries: this.MAX_RETRIES,
            timestamp: new Date('2025-02-21T14:53:22Z').toISOString(),
            user: 'klakrketn'
        });
    }
    async createOrder(mint, side, type, amount, price, strategy = 'NORMAL') {
        try {
            await this.rateLimiter.waitForSlot();
            // Проверка лимитов
            if (this.pendingOrders.size >= this.MAX_CONCURRENT_ORDERS) {
                throw new Error('Maximum concurrent orders limit reached');
            }
            // Проверка рисков
            const riskCheck = await this.riskManagement.evaluateTradeRisk(mint, amount, price || await this.getCurrentPrice(mint), await this.getPortfolioValue());
            if (!riskCheck.approved) {
                throw new Error(`Risk check failed: ${riskCheck.warnings.join(', ')}`);
            }
            const orderId = this.generateOrderId();
            const order = {
                id: orderId,
                mint,
                side,
                type,
                amount,
                price,
                strategy,
                status: 'PENDING',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                fills: [],
                remainingAmount: amount,
                averagePrice: 0,
                retryCount: 0,
                warnings: [],
                stopLoss: riskCheck.suggestedStopLoss,
                takeProfit: riskCheck.suggestedTakeProfit
            };
            this.orders.set(orderId, order);
            this.pendingOrders.add(orderId);
            this.logger.info('Order created', {
                orderId,
                mint,
                side,
                type,
                amount,
                price,
                strategy,
                timestamp: new Date('2025-02-21T14:53:22Z').toISOString(),
                user: 'klakrketn'
            });
            return orderId;
        }
        catch (error) {
            this.logger.error('Error creating order', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                side,
                type,
                amount,
                price,
                timestamp: new Date('2025-02-21T14:53:22Z').toISOString()
            });
            return null;
        }
    }
    async processPendingOrders() {
        for (const orderId of this.pendingOrders) {
            try {
                await this.rateLimiter.waitForSlot();
                const order = this.orders.get(orderId);
                if (!order)
                    continue;
                const result = await this.executeOrder(order);
                if (result.success) {
                    this.pendingOrders.delete(orderId);
                    this.updateOrderStatus(orderId, 'FILLED', result);
                }
                else if (order.retryCount >= this.MAX_RETRIES) {
                    this.pendingOrders.delete(orderId);
                    this.updateOrderStatus(orderId, 'FAILED', result);
                }
                else {
                    order.retryCount++;
                    order.warnings.push(result.error || 'Unknown execution error');
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                }
            }
            catch (error) {
                this.logger.error('Error processing pending order', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    orderId,
                    timestamp: new Date('2025-02-21T14:53:22Z').toISOString()
                });
            }
        }
    }
    async executeOrder(order) {
        try {
            // Получаем актуальный ордербук
            const orderBook = await this.getOrderBook(order.mint);
            if (!orderBook) {
                return {
                    success: false,
                    error: 'Unable to fetch order book'
                };
            }
            // Проверяем условия исполнения
            const currentPrice = await this.getCurrentPrice(order.mint);
            if (!this.checkExecutionConditions(order, currentPrice)) {
                return {
                    success: false,
                    error: 'Execution conditions not met'
                };
            }
            // Создаем и отправляем транзакцию
            const transaction = await this.createOrderTransaction(order, currentPrice);
            const signature = await this.connection.sendTransaction(transaction, [], { maxRetries: this.MAX_RETRIES });
            // Ждем подтверждения
            const confirmation = await this.connection.confirmTransaction(signature);
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
            }
            return {
                success: true,
                signature,
                price: currentPrice,
                amount: order.amount,
                timestamp: Date.now()
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown execution error'
            };
        }
    }
    checkExecutionConditions(order, currentPrice) {
        if (!currentPrice)
            return false;
        switch (order.type) {
            case 'MARKET':
                return true;
            case 'LIMIT':
                if (!order.price)
                    return false;
                return order.side === 'BUY' ?
                    currentPrice <= order.price :
                    currentPrice >= order.price;
            case 'STOP_LIMIT':
                if (!order.price || !order.stopLoss)
                    return false;
                return order.side === 'SELL' ?
                    currentPrice <= order.stopLoss :
                    currentPrice >= order.stopLoss;
            default:
                return false;
        }
    }
    async createOrderTransaction(order, currentPrice) {
        // Здесь должна быть логика создания транзакции
        // в зависимости от типа ордера и используемого DEX
        throw new Error('Not implemented');
    }
    async getCurrentPrice(mint) {
        try {
            const price = await this.marketAnalysis.getCurrentPrice(mint);
            return price || 0;
        }
        catch (error) {
            this.logger.error('Error getting current price', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T14:53:22Z').toISOString()
            });
            return 0;
        }
    }
    async getOrderBook(mint) {
        try {
            await this.rateLimiter.waitForSlot();
            // Здесь должна быть логика получения ордербука из DEX
            return null;
        }
        catch (error) {
            this.logger.error('Error fetching order book', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T14:53:22Z').toISOString()
            });
            return null;
        }
    }
    async getPortfolioValue() {
        // Здесь должна быть логика получения общей стоимости портфеля
        return 1000; // Заглушка
    }
    updateOrderStatus(orderId, status, result) {
        const order = this.orders.get(orderId);
        if (!order)
            return;
        order.status = status;
        order.updatedAt = Date.now();
        if (result?.success) {
            order.fills.push({
                price: result.price,
                amount: result.amount,
                timestamp: result.timestamp
            });
            // Обновляем среднюю цену исполнения
            const totalAmount = order.fills.reduce((sum, fill) => sum + fill.amount, 0);
            const weightedSum = order.fills.reduce((sum, fill) => sum + fill.price * fill.amount, 0);
            order.averagePrice = weightedSum / totalAmount;
            order.remainingAmount = Math.max(0, order.amount - order.fills.reduce((sum, fill) => sum + fill.amount, 0));
        }
        this.orders.set(orderId, order);
        this.logger.info('Order status updated', {
            orderId,
            status,
            result,
            timestamp: new Date('2025-02-21T14:53:22Z').toISOString(),
            user: 'klakrketn'
        });
    }
    cancelOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order || order.status !== 'PENDING') {
            return false;
        }
        this.pendingOrders.delete(orderId);
        this.updateOrderStatus(orderId, 'CANCELLED');
        this.logger.info('Order cancelled', {
            orderId,
            timestamp: new Date('2025-02-21T14:53:22Z').toISOString(),
            user: 'klakrketn'
        });
        return true;
    }
    getOrder(orderId) {
        return this.orders.get(orderId) || null;
    }
    getOrders(status) {
        const allOrders = Array.from(this.orders.values());
        return status ? allOrders.filter(order => order.status === status) : allOrders;
    }
    generateOrderId() {
        return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    stop() {
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
        }
        this.logger.info('Order management service stopped', {
            timestamp: new Date('2025-02-21T14:53:22Z').toISOString(),
            user: 'klakrketn'
        });
    }
}
exports.OrderManagementService = OrderManagementService;
