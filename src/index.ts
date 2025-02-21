import { config } from 'dotenv';
import { Connection } from '@solana/web3.js';
import * as winston from 'winston';
import { SolanaService } from './services/SolanaService';
import { MarketAnalysisService } from './services/MarketAnalysisService';
import { MonitoringService } from './services/MonitoringService';
import { TradingStrategyService } from './services/TradingStrategyService';
import { RiskManagementService } from './services/RiskManagementService';
import { TelegramService } from './services/TelegramService';
import { DeepSeekService } from './services/DeepSeekService';
import { TradeService } from './services/TradeService';
import { 
    TransactionData, 
    ServiceHealth,
    TelegramAlert,
    ServiceMetadata
} from './types/PumpFunTypes';

// Загружаем .env файл
config();

// Настройка логгера
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.errors({ stack: true })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, timestamp, metadata }) => {
                    let output = `${timestamp} ${level}: ${message}`;
                    if (metadata && Object.keys(metadata as Record<string, unknown>).length > 0) {
                        output += ` ${JSON.stringify(metadata)}`;
                    }
                    return output;
                })
            )
        }),
        new winston.transports.File({ 
            filename: process.env.LOG_FILE_PATH || 'app.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

async function main() {
    try {
        logger.info('Starting Solana Pump Bot...', {
            version: '1.0.0',
            timestamp: new Date('2025-02-21T15:11:43Z').toISOString(),
            rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT
        });

        // Проверка необходимых переменных окружения
        const requiredEnvVars = [
            'SOLANA_RPC_ENDPOINT',
            'TELEGRAM_BOT_TOKEN',
            'OPENROUTER_API_KEY',
            'PRIVATE_KEY'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }

        // Инициализация connection
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT as string, {
            commitment: 'confirmed',
            disableRetryOnRateLimit: true,
            confirmTransactionInitialTimeout: 60000,
            wsEndpoint: process.env.SOLANA_WS_ENDPOINT
        });

        // Инициализация сервисов
        let services = await initializeServices(connection, logger);

        // Проверка соединения
        const version = await connection.getVersion();
        logger.info('Connected to Solana network', {
            version: version['solana-core'],
            timestamp: new Date('2025-02-21T15:11:43Z').toISOString()
        });

        // Основной цикл обработки
        while (true) {
            try {
                await processTransactions(services);
                await new Promise(resolve => setTimeout(resolve, 
                    Number(process.env.MONITORING_INTERVAL || 1000)
                ));
            } catch (error) {
                handleError('Error in main loop', error, logger);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

    } catch (error) {
        handleError('Fatal error', error, logger);
        process.exit(1);
    }
}

interface Services {
    telegramService: TelegramService;
    monitoringService: MonitoringService;
    solanaService: SolanaService;
    marketAnalysisService: MarketAnalysisService;
    deepSeekService: DeepSeekService;
    riskManagementService: RiskManagementService;
    tradingStrategyService: TradingStrategyService;
    tradeService: TradeService;
}

async function initializeServices(connection: Connection, logger: winston.Logger): Promise<Services> {
    try {
        const marketAnalysisService = new MarketAnalysisService(connection, logger);
        const monitoringService = new MonitoringService(
            connection,
            marketAnalysisService,
            logger
        );
        
        const telegramService = new TelegramService(logger);
        const solanaService = new SolanaService(connection, logger);
        const deepSeekService = new DeepSeekService(logger);
        
        const riskManagementService = new RiskManagementService(
            marketAnalysisService,
            monitoringService,
            logger
        );
        
        const tradingStrategyService = new TradingStrategyService(
            marketAnalysisService,
            monitoringService,
            logger
        );
        
        const tradeService = new TradeService(deepSeekService, logger);

        return {
            telegramService,
            monitoringService,
            solanaService,
            marketAnalysisService,
            deepSeekService,
            riskManagementService,
            tradingStrategyService,
            tradeService
        };
    } catch (error) {
        handleError('Failed to initialize services', error, logger);
        throw error;
    }
}

async function processTransactions(services: Services) {
    await services.solanaService.processNewTransactions(
        async (txs: TransactionData[]) => {
            logger.info('Processing new transactions', {
                count: txs.length,
                timestamp: new Date('2025-02-21T15:11:43Z').toISOString()
            });

            for (const tx of txs) {
                try {
                    await processTransaction(tx, services);
                } catch (error) {
                    handleError('Error processing transaction', error, logger, {
                        signature: tx.signature
                    });
                }
            }
        }
    );

    services.monitoringService.recordTransaction('SolanaService');
}

async function processTransaction(tx: TransactionData, services: Services) {
    // Базовая валидация транзакции
    if (!tx.tokenTransfers[0]?.mint) {
        logger.debug('Skipping transaction without token transfers', {
            signature: tx.signature
        });
        return;
    }

    // Получаем анализ от DeepSeek
    const analysis = await services.deepSeekService.analyzeTransaction(tx);
    
    // Если уверенность низкая, пропускаем
    if (!analysis || analysis.confidence < 0.7) {
        logger.debug('Skipping transaction due to low confidence', {
            signature: tx.signature,
            confidence: analysis?.confidence
        });
        return;
    }

    // Оценка рисков
    const riskAnalysis = await services.riskManagementService.evaluateTradeRisk(
        tx.tokenTransfers[0].mint,
        parseFloat(tx.tokenTransfers[0].amount),
        analysis.riskLevel === 'HIGH' ? 0.8 : 
        analysis.riskLevel === 'MEDIUM' ? 0.5 : 0.3,
        100000
    );

    if (!riskAnalysis.approved) {
        await services.telegramService.notifyRiskWarning({
            type: 'WARNING',
            signature: tx.signature,
            token: tx.tokenTransfers[0].mint,
            amount: tx.tokenTransfers[0].amount,
            programId: tx.programId,
            confidence: analysis.confidence,
            analysis: analysis
        });
        return;
    }

    // Анализ стратегий
    const strategies = services.tradingStrategyService.getAllStrategies();
    for (const strategy of strategies) {
        const signal = await services.tradingStrategyService.analyzeToken(
            tx.tokenTransfers[0].mint,
            strategy.name
        );

        if (signal && signal.confidence > 0.7) {
            // Отправляем уведомление в Telegram
            await services.telegramService.notifyTradeSignal({
                type: 'SIGNAL',
                signature: tx.signature,
                token: signal.mint,
                amount: tx.tokenTransfers[0].amount,
                programId: tx.programId,
                confidence: signal.confidence,
                strategy: strategy.name,
                analysis: analysis
            });

            // Выполняем торговлю если все проверки пройдены
            if (analysis.action === 'BUY' && signal.confidence > 0.8) {
                await services.tradeService.copyTrade(
                    tx.tokenTransfers[0].mint,
                    [tx]
                );
            }
        }
    }
}

function handleError(message: string, error: unknown, logger: winston.Logger, context = {}) {
    logger.error(message, {
        error: error instanceof Error ? {
            message: error.message,
            stack: error.stack
        } : 'Unknown error',
        ...context,
        timestamp: new Date('2025-02-21T15:11:43Z').toISOString()
    });
}

// Обработчики ошибок
process.on('unhandledRejection', (error) => {
    handleError('Unhandled rejection', error, logger);
});

process.on('uncaughtException', (error) => {
    handleError('Uncaught exception', error, logger);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Performing graceful shutdown...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT. Performing graceful shutdown...');
    process.exit(0);
});

main().catch(error => {
    handleError('Unhandled error in main', error, logger);
    process.exit(1);
});