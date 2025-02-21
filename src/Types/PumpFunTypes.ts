import { ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';

// Базовые типы для ордеров
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
export type OrderExecutionStrategy = 'NORMAL' | 'AGGRESSIVE' | 'PASSIVE';

export interface OrderFill {
    price: number;
    amount: number;
    timestamp: number;
}

export interface Order {
    id: string;
    mint: string;
    side: OrderSide;
    type: OrderType;
    amount: number;
    price?: number;
    strategy: OrderExecutionStrategy;
    status: OrderStatus;
    createdAt: number;
    updatedAt: number;
    fills: OrderFill[];
    remainingAmount: number;
    averagePrice: number;
    retryCount: number;
    warnings: string[];
    stopLoss?: number;
    takeProfit?: number;
}

export interface OrderBook {
    bids: Array<[number, number]>; // [price, size]
    asks: Array<[number, number]>; // [price, size]
    mint: string;
    timestamp: number;
}

export interface ExecutionResult {
    success: boolean;
    error?: string;
    signature?: string;
    price?: number;
    amount?: number;
    timestamp?: number;
}

// Сервисные типы
export interface ServiceHealth {
    isHealthy: boolean;
    lastCheck: number;
    errors: ErrorLog[];
    performance: PerformanceMetrics;
    status: ServiceStatus;
}

export interface ServiceMetadata {
    name: string;
    version: string;
    startTime: number;
    config: Record<string, unknown>;
}

// Типы для Telegram уведомлений
export type TelegramAlertType = 'ENTRY' | 'EXIT' | 'SIGNAL' | 'WARNING' | 'ERROR' | 'INFO';

export interface TelegramAlert {
    type: TelegramAlertType;
    message: string;
    timestamp: number;
    signature?: string;
    token?: string;
    amount?: string;
    programId?: string;
    confidence?: number;
    strategy?: string;
    analysis?: DeepSeekAnalysis;
    error?: string;
    riskAnalysis?: RiskAnalysis;
    reason?: string[];
}

export interface TelegramTradeAlert extends TelegramAlert {
    type: Extract<TelegramAlertType, 'ENTRY' | 'EXIT' | 'SIGNAL' | 'WARNING'>;
    token: string;
    amount: string;
    programId: string;
    confidence?: number;
    strategy?: string;
}

export interface TelegramRejectionAlert {
    signature: string;
    token: string;
    amount: string;
    programId: string;
    riskAnalysis: RiskAnalysis;
}

// Метрики и анализ
export interface TokenMetrics {
    mint: string;
    volume24h: number;
    priceChange24h: number;
    liquidity: number;
    holders: number;
    transactions24h: number;
    price: number;
}

export interface RiskMetrics {
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    successRate: number;
    failureRate: number;
    riskScore: number;
}

export interface MarketData {
    price: number;
    volume24h: number;
    marketCap: number;
    fullyDilutedMarketCap: number;
    circulatingSupply: number;
    totalSupply: number;
    priceChange: {
        '1h': number;
        '24h': number;
        '7d': number;
    };
    highLow: {
        '24h': { high: number; low: number };
        '7d': { high: number; low: number };
    };
    lastUpdated: Date;
}
// Торговые сигналы и анализ
export interface TradeSignal {
    strategy: string;
    action: OrderSide;
    mint: string;
    confidence: number;
    reason: string[];
    timestamp: number;
    suggestedEntry?: number;
    suggestedExit?: number;
    stopLoss?: number;
    metrics?: TokenMetrics;
    riskMetrics?: RiskMetrics;
}

export interface DeepSeekAnalysis {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestedEntry?: number;
    suggestedExit?: number;
    stopLoss?: number;
    predictedProfit?: number;
    marketSentiment?: string;
    volumeAnalysis?: string;
    timestamp?: number; // Добавлено поле timestamp
    analyst?: string;   // Добавлено поле analyst
}

export interface RiskAnalysis {
    riskScore: number;
    warnings: string[];
    maxAmount?: number;
    suggestedStopLoss?: number;
    suggestedTakeProfit?: number;
    approved: boolean;
    timestamp: number;
    analyst: string;
}

// Типы для транзакций
export interface TokenTransfer {
    mint: string;
    fromUserAccount: string;
    toUserAccount: string;
    amount: string;
    timestamp: number;
    signature: string;
    price?: number;
    decimals?: number;
}

export interface TransactionData {
    signature: string;
    timestamp: number;
    programId: string;
    tokenTransfers: {
        mint: string;
        amount: string;
        price: number;
        decimals: number;
        fromUserAccount?: string;
        toUserAccount?: string;
    }[];
    type?: string;
    blockTime?: number;
    accountKeys?: string[];
    meta?: {
        err: any;
        fee: number;
        postBalances: number[];
        preBalances: number[];
        innerInstructions: any[];
    };
    instructionData?: string;
    analysis?: DeepSeekAnalysis;
}

// Типы для мониторинга и метрик
export interface ServiceStatus {
    isHealthy: boolean;
    lastCheck: number;
    errors: ErrorLog[];
    metrics: {
        requestsPerMinute: number;
        averageResponseTime: number;
        errorRate: number;
        lastUpdated: number;
        updatedBy: string;
    };
}

export interface ErrorLog {
    id: string;
    timestamp: number;
    level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FATAL';
    message: string;
    context: {
        service: string;
        method: string;
        params?: any;
        error?: string;
    };
    stack?: string;
    resolved: boolean;
    resolutionTime?: number;
    resolvedBy?: string;
}

export interface PerformanceMetrics {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    rpcLatency: number;
    transactionsPerSecond: number;
    pendingTransactions: number;
    lastBlockProcessingTime: number;
    timestamp: number;
    collector: string;
}

export interface MonitoringMetrics {
    startTime: Date;
    uptime: number;
    totalProcessedTransactions: number;
    processedTransactionsPerMinute: number;
    lastProcessedBlock: number;
    errorRate: number;
    lastError?: {
        message: string;
        timestamp: Date;
        stack?: string;
    };
    lastUpdated: number;
    updatedBy: string;
}
// Типы для анализа кошельков и метрики
export interface WalletMetrics {
    tradingVolume24h: number;
    totalTrades: number;
    successRate: number;
    profitLoss: number;
    averageTradeSize: number;
    tradeFrequency: number;
    uniqueTokens: number;
    largestTrade: number;
    balance: number;
    age: number;
    lastTradeTime: number;
    lastUpdated: number;
    analyzedBy: string;
}

export interface WalletAnalysis {
    address: string;
    balance: number;
    totalTrades: number;
    successRate: number;
    profitLoss: number;
    uniqueTokens: number;
    recentActivity: string;
    tradingVolume24h: number;
    averageTradeSize: number;
    largestTrade: number;
    tradeFrequency: number;
    lastTradeTime: number;
    tokenLiquidity: { [key: string]: number };
    score: number;
    category: string;
    flags: string[];
    insights: string[];
    metrics: WalletMetrics;
    riskMetrics: RiskMetrics;
    isSuspicious: boolean;
    lastUpdated: number;
    analyzedBy: string;
}

// Конфигурация и настройки
export interface TradeConfig {
    maxRiskPerTrade: number;
    stopLossPercentage: number;
    takeProfitPercentage: number;
    maxOpenTrades: number;
    minLiquidity: number;
    maxSlippage: number;
    tradingEnabled: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    lastUpdated: number;
    updatedBy: string;
}

export interface StrategyConfig {
    timeframe: string;
    minVolume: number;
    minLiquidity: number;
    maxSlippage: number;
    minConfidence: number;
    maxRiskScore: number;
    enabledIndicators: string[];
    tradingPairs: string[];
    maxPositions: number;
    maxLossPerTrade: number;
    takeProfitLevel: number;
    stopLossLevel: number;
    lastUpdated: number;
    updatedBy: string;
}

export interface BotSettings {
    tradingEnabled: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    maxDailyLoss: number;
    maxDrawdown: number;
    notificationsEnabled: boolean;
    debugMode: boolean;
    autoRestartEnabled: boolean;
    maintenanceMode: boolean;
    lastUpdated: number;
    updatedBy: string;
}

// Типы для позиций и торговли
export interface TradePosition {
    id: string;
    tokenMint: string;
    entryPrice: number;
    currentPrice: number;
    amount: number;
    stopLoss: number;
    takeProfit: number;
    openTime: number;
    lastUpdate: number;
    profitLoss: number;
    status: 'open' | 'closed' | 'pending';
    updatedBy: string;
}

export interface PositionTradeMetrics {
    mint: string;
    entryPrice: number;
    currentPrice: number;
    size: number;
    timestamp: number;
    profitLoss: number;
    holdingTime: number;
    riskScore: number;
    status: 'open' | 'closed' | 'pending';
    updatedBy: string;
}

export interface TradeResult {
    success: boolean;
    tokenMint: string;
    type: 'buy' | 'sell';
    amount: number;
    price: number;
    timestamp: number;
    signature?: string;
    error?: string;
    fees?: number;
    slippage?: number;
    profitLoss?: number;
    executedBy: string;
    metadata?: {
        strategy?: string;
        confidence?: number;
        riskScore?: number;
        marketConditions?: {
            volatility: number;
            liquidity: number;
            trend: 'up' | 'down' | 'sideways';
        };
    };
}
// Типы для событий и уведомлений
export interface TradeEvent {
    type: 'entry' | 'exit' | 'stopLoss' | 'takeProfit';
    timestamp: number;
    tokenMint: string;
    price: number;
    amount: number;
    profitLoss?: number;
    fees: number;
    txHash: string;
    triggeredBy: string;
}

export interface Notification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: number;
    priority: 'low' | 'medium' | 'high';
    read: boolean;
    metadata?: Record<string, any>;
    createdBy: string;
}

// Типы для статистики и производительности
export interface TradingStats {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalVolume: number;
    totalProfit: number;
    totalLoss: number;
    largestProfit: number;
    largestLoss: number;
    averageProfit: number;
    averageLoss: number;
    winRate: number;
    profitFactor: number;
    lastUpdated: number;
    collectedBy: string;
}

export interface TokenInfo {
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    totalSupply: number;
    holders: number;
    price: number;
    priceChange24h: number;
    volume24h: number;
    liquidity: number;
    marketCap: number;
    lastUpdated: number;
    verifiedBy: string;
}

// Типы для API и кэширования
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
    timestamp: number;
    version: string;
    processedBy: string;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    lastAccessed: number;
    accessCount: number;
    createdBy: string;
}

// Типы для настроек торговли
export interface TradeSettings {
    maxSlippage: number;
    minLiquidity: number;
    maxPositionSize: number;
    lastUpdated: number;
    updatedBy: string;
}

// Дополнительные типы для мониторинга сервисов
export interface ServiceConfig {
    name: string;
    enabled: boolean;
    priority: number;
    retryAttempts: number;
    timeoutMs: number;
    maxConcurrentRequests: number;
    rateLimitPerMinute: number;
    lastUpdated: number;
    updatedBy: string;
}

export interface ServiceEvent {
    id: string;
    serviceId: string;
    type: 'start' | 'stop' | 'restart' | 'error' | 'warning';
    timestamp: number;
    message: string;
    metadata?: Record<string, any>;
    triggeredBy: string;
}

export interface HealthCheckResult {
    serviceId: string;
    status: 'healthy' | 'degraded' | 'failed';
    timestamp: number;
    responseTime: number;
    details?: Record<string, any>;
    checkedBy: string;
}

// Константы
export const Constants = {
    MAX_RETRIES: 3,
    REQUEST_TIMEOUT: 30000,
    CACHE_TTL: 300000, // 5 минут
    MAX_BATCH_SIZE: 100,
    MIN_LIQUIDITY: 1000,
    MAX_SLIPPAGE: 0.01,
    DEFAULT_GAS_ADJUSTMENT: 1.4,
    RATE_LIMIT_WINDOW: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    
    // Новые константы для мониторинга
    HEALTH_CHECK_INTERVAL: 60000, // 1 минута
    MAX_ERROR_RETRY_DELAY: 300000, // 5 минут
    MIN_CONFIDENCE_THRESHOLD: 0.7,
    HIGH_CONFIDENCE_THRESHOLD: 0.9,
    
    // Константы для управления рисками
    MAX_POSITION_SIZE_USD: 10000,
    MAX_DAILY_LOSS_USD: 1000,
    DEFAULT_STOP_LOSS_PERCENT: 0.05,
    DEFAULT_TAKE_PROFIT_PERCENT: 0.1,
    
    // Временные константы
    DATE_FORMAT: 'YYYY-MM-DD HH:mm:ss',
    MAX_TRANSACTION_AGE: 3600, // 1 час
    PRICE_UPDATE_INTERVAL: 15000, // 15 секунд
    
    // Системные константы
    VERSION: '1.0.0',
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    DEFAULT_USER: 'klakrketn'
} as const;

// Типы для аудита и логирования
export interface AuditEntry {
    id: string;
    timestamp: number;
    user: string;
    action: string;
    details: Record<string, any>;
    ipAddress?: string;
    success: boolean;
    duration?: number;
}

export interface LogEntry {
    timestamp: number;
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    message: string;
    context?: Record<string, any>;
    user: string;
    service?: string;
    trace?: string;
}