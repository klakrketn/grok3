"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeService = void 0;
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
class TradeService {
    constructor(deepSeek, logger) {
        this.deepSeek = deepSeek;
        this.logger = logger;
        this.isTrading = true;
        this.lastTradeTime = 0;
        this.activeTrades = new Map();
        // Константы риск-менеджмента
        this.MIN_TRADE_INTERVAL = 5000; // 5 секунд
        this.MAX_RISK_PER_TRADE = 0.01; // 1%
        this.MIN_PROFIT = 1.5; // 150%
        this.MAX_SLIPPAGE = 0.02; // 2%
        this.MIN_CONFIDENCE = 0.7; // 70%
        this.MAX_ACTIVE_TRADES = 5;
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY not found in environment variables');
        }
        this.connection = new web3_js_1.Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
            wsEndpoint: process.env.SOLANA_WS_ENDPOINT
        });
        try {
            const secretKey = bs58_1.default.decode(process.env.PRIVATE_KEY);
            this.wallet = web3_js_1.Keypair.fromSecretKey(secretKey);
            this.capital = parseFloat(process.env.INITIAL_CAPITAL || '2.5');
            this.logger.info('TradeService initialized successfully', {
                publicKey: this.wallet.publicKey.toString(),
                initialCapital: this.capital
            });
            this.startMetricsMonitoring();
        }
        catch (error) {
            this.logger.error('Failed to initialize TradeService', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async checkTradeConditions(amount, analysis) {
        // Проверка статуса торговли
        if (!this.isTrading) {
            this.logger.debug('Trading is currently disabled');
            return false;
        }
        // Проверка временного интервала
        const now = Date.now();
        if (now - this.lastTradeTime < this.MIN_TRADE_INTERVAL) {
            this.logger.debug('Trade rejected: Too soon after last trade');
            return false;
        }
        // Проверка количества активных сделок
        if (this.activeTrades.size >= this.MAX_ACTIVE_TRADES) {
            this.logger.debug('Trade rejected: Maximum active trades reached');
            return false;
        }
        // Проверка анализа DeepSeek
        if (analysis && analysis.confidence < this.MIN_CONFIDENCE) {
            this.logger.debug('Trade rejected: Low confidence score', {
                confidence: analysis.confidence
            });
            return false;
        }
        // Проверка размера позиции
        if (amount > this.capital * this.MAX_RISK_PER_TRADE) {
            this.logger.debug('Trade rejected: Position size too large');
            return false;
        }
        // Проверка баланса
        try {
            const balance = await this.connection.getBalance(this.wallet.publicKey);
            const balanceInSol = balance / 1e9;
            if (balanceInSol < amount) {
                this.logger.debug('Trade rejected: Insufficient balance', {
                    required: amount,
                    available: balanceInSol
                });
                return false;
            }
        }
        catch (error) {
            this.logger.error('Failed to check balance', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
        return true;
    }
    async copyTrade(wallet, transactions) {
        if (!this.isTrading) {
            this.logger.info('Trading is currently disabled');
            return;
        }
        try {
            const recentTx = transactions[0];
            if (!recentTx || !recentTx.tokenTransfers.length) {
                this.logger.debug('No valid transactions to copy');
                return;
            }
            // Получаем анализ от DeepSeek
            const analysis = await this.deepSeek.analyzeTransaction(recentTx);
            // Проверяем рекомендацию
            if (analysis.action !== 'BUY') {
                this.logger.debug('Trade rejected: DeepSeek suggests not to buy', {
                    action: analysis.action,
                    reasoning: analysis.reasoning
                });
                return;
            }
            const transfer = recentTx.tokenTransfers[0];
            const amount = Math.min(parseFloat(transfer.amount) / 1e9 * this.MAX_RISK_PER_TRADE, this.capital * this.MAX_RISK_PER_TRADE);
            if (!(await this.checkTradeConditions(amount, analysis))) {
                return;
            }
            // Создаем транзакцию с приоритетными комиссиями
            const transaction = new web3_js_1.Transaction();
            // Добавляем инструкцию для приоритетных комиссий
            transaction.add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 50000 // Настройте в зависимости от загруженности сети
            }));
            // Добавляем основную инструкцию перевода
            transaction.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: new web3_js_1.PublicKey(wallet),
                lamports: Math.floor(amount * 1e9)
            }));
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, [this.wallet], {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3,
                lastValidBlockHeight
            });
            // Обновляем состояние
            this.lastTradeTime = Date.now();
            this.activeTrades.set(signature, {
                entryPrice: transfer.price,
                currentPrice: transfer.price,
                profitLoss: 0,
                holdingTime: 0,
                riskScore: analysis.riskLevel === 'HIGH' ? 0.8 :
                    analysis.riskLevel === 'MEDIUM' ? 0.5 : 0.3
            });
            this.logger.info('Trade executed successfully', {
                signature,
                amount,
                wallet,
                currentCapital: this.capital,
                analysis: {
                    confidence: analysis.confidence,
                    riskLevel: analysis.riskLevel,
                    predictedProfit: analysis.predictedProfit
                }
            });
        }
        catch (error) {
            this.logger.error('Error executing trade', {
                error: error instanceof Error ? error.message : 'Unknown error',
                wallet,
                timestamp: new Date().toISOString()
            });
        }
    }
    startMetricsMonitoring() {
        setInterval(() => {
            this.updatePositionTradeMetrics();
        }, 60000); // Обновление каждую минуту
    }
    async updatePositionTradeMetrics() {
        for (const [signature, metrics] of this.activeTrades) {
            try {
                // Обновляем метрики
                metrics.holdingTime = Date.now() - this.lastTradeTime;
                // Проверяем условия выхода
                if (metrics.profitLoss >= this.MIN_PROFIT ||
                    metrics.riskScore > 0.9) {
                    await this.exitTrade(signature);
                }
            }
            catch (error) {
                this.logger.error('Error updating trade metrics', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    signature
                });
            }
        }
    }
    async exitTrade(signature) {
        // Логика выхода из позиции
        // Будет реализована позже
    }
    // Методы управления торговлей
    stopTrading() {
        this.isTrading = false;
        this.logger.info('Trading stopped');
    }
    startTrading() {
        this.isTrading = true;
        this.logger.info('Trading started');
    }
    getStatus() {
        return {
            isTrading: this.isTrading,
            capital: this.capital,
            lastTradeTime: this.lastTradeTime,
            activeTrades: this.activeTrades.size
        };
    }
}
exports.TradeService = TradeService;
