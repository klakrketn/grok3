import { 
    Connection, 
    PublicKey, 
    ParsedTransactionWithMeta,
    ParsedInstruction,
    PartiallyDecodedInstruction,
    TokenBalance,
    TransactionSignature,
    SignaturesForAddressOptions,
    Commitment
} from '@solana/web3.js';
import * as winston from 'winston';
import { 
    TransactionData, 
    TokenTransfer, 
    TokenMetrics, 
    MarketData, 
    OrderBook,
    ServiceHealth,
    HealthCheckResult,
    PerformanceMetrics
} from '../types/PumpFunTypes';
import { ISolanaService } from '../interfaces/IServices';

export class SolanaService implements ISolanaService {
    private lastProcessedSlot: number = 0;
    private isProcessing: boolean = false;
    private readonly raydiumPrograms: PublicKey[];
    private currentRaydiumIndex: number = 0;
    private readonly MAX_RETRIES = 3;
    private readonly INITIAL_BACKOFF = 1000;
    private readonly BATCH_SIZE = 5;
    private readonly REQUEST_INTERVAL = 70;
    private lastRequestTime: number = 0;
    private readonly startTime: number;

    constructor(
        public readonly connection: Connection,
        public readonly logger: winston.Logger
    ) {
        this.startTime = Date.now();
        try {
            this.raydiumPrograms = [
                new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'), // Raydium AMM V3
                new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'), // Raydium CLMM
                new PublicKey('routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS')  // Raydium Router
            ];
            
            this.logger.info('SolanaService initialized', {
                timestamp: new Date('2025-02-21T21:01:49Z').toISOString(),
                programIds: this.raydiumPrograms.map(p => p.toString()),
                user: 'klakrketn'
            });

            this.validateConnection();
        } catch (error) {
            this.logger.error('Failed to initialize SolanaService', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date('2025-02-21T21:01:49Z').toISOString(),
                user: 'klakrketn'
            });
            throw error;
        }
    }

    // Новые методы из ISolanaService
    public async getTokenMetrics(mint: string): Promise<TokenMetrics> {
        try {
            const publicKey = new PublicKey(mint);
            const [supply, decimals] = await Promise.all([
                this.retryWithBackoff(() => this.connection.getTokenSupply(publicKey)),
                this.retryWithBackoff(() => this.connection.getTokenLargestAccounts(publicKey))
            ]);

            return {
                mint,
                price: 0, // Требуется реализация получения цены
                volume24h: 0, // Требуется реализация получения объема
                priceChange24h: 0, // Требуется реализация получения изменения цены
                liquidity: supply.value.uiAmount || 0,
                decimals: supply.value.decimals,
                holders: 0, // Требуется реализация получения количества держателей
                timestamp: Date.now()
            };
        } catch (error) {
            this.logger.error('Error getting token metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:01:49Z').toISOString(),
                user: 'klakrketn'
            });
            throw error;
        }
    }

    public async getMarketData(mint: string): Promise<MarketData> {
        try {
            // Требуется реализация получения рыночных данных
            return {
                mint,
                price: 0,
                bid: 0,
                ask: 0,
                volume24h: 0,
                priceChange24h: 0,
                highPrice24h: 0,
                lowPrice24h: 0,
                lastTrade: 0,
                timestamp: Date.now()
            };
        } catch (error) {
            this.logger.error('Error getting market data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:01:49Z').toISOString(),
                user: 'klakrketn'
            });
            throw error;
        }
    }

    public async getOrderBook(mint: string): Promise<OrderBook> {
        try {
            // Требуется реализация получения книги ордеров
            return {
                mint,
                bids: [],
                asks: [],
                timestamp: Date.now()
            };
        } catch (error) {
            this.logger.error('Error getting order book', {
                error: error instanceof Error ? error.message : 'Unknown error',
                mint,
                timestamp: new Date('2025-02-21T21:01:49Z').toISOString(),
                user: 'klakrketn'
            });
            throw error;
        }
    }

    // Методы из IBaseService
    public async healthCheck(): Promise<HealthCheckResult> {
        try {
            const startTime = Date.now();
            const version = await this.connection.getVersion();
            const responseTime = Date.now() - startTime;

            return {
                serviceId: 'SolanaService',
                status: 'healthy',
                timestamp: Date.now(),
                responseTime,
                details: {
                    version: version['solana-core'],
                    lastProcessedSlot: this.lastProcessedSlot
                },
                checkedBy: 'klakrketn'
            };
        } catch (error) {
            return {
                serviceId: 'SolanaService',
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
        const healthCheck = await this.healthCheck();
        const performance = await this.getPerformanceMetrics();

        return {
            isHealthy: healthCheck.status === 'healthy',
            lastCheck: Date.now(),
            errors: [],
            performance,
            status: {
                isHealthy: healthCheck.status === 'healthy',
                lastCheck: Date.now(),
                errors: [],
                metrics: {
                    requestsPerMinute: 0, // Требуется реализация
                    averageResponseTime: healthCheck.responseTime,
                    errorRate: 0, // Требуется реализация
                    lastUpdated: Date.now(),
                    updatedBy: 'klakrketn'
                }
            }
        };
    }

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
            transactionsPerSecond: 0, // Требуется реализация
            pendingTransactions: 0, // Требуется реализация
            lastBlockProcessingTime: blockTime ? Date.now() - (blockTime * 1000) : 0,
            timestamp: Date.now(),
            collector: 'klakrketn'
        };
    }

    private async validateConnection(): Promise<void> {
        try {
            const version = await this.connection.getVersion();
            this.logger.info('Solana connection validated', {
                version: version['solana-core'],
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
        } catch (error) {
            this.logger.error('Failed to validate Solana connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
        }
    }

    private async throttleRequest(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.REQUEST_INTERVAL) {
            await new Promise(resolve => 
                setTimeout(resolve, this.REQUEST_INTERVAL - timeSinceLastRequest)
            );
        }
        
        this.lastRequestTime = Date.now();
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        try {
            await this.throttleRequest();
            return await operation();
        } catch (error: unknown) {
            if (!(error instanceof Error)) {
                throw error;
            }

            const isRateLimit = error.message.includes('429') || 
                              error.message.includes('Too Many Requests');

            if (isRateLimit && retryCount < this.MAX_RETRIES) {
                const delay = this.INITIAL_BACKOFF * Math.pow(2, retryCount);
                this.logger.warn(`Rate limit hit, retrying after ${delay}ms`, {
                    retryCount,
                    delay,
                    timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                    user: 'klakrketn'
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryWithBackoff(operation, retryCount + 1);
            }

            throw error;
        }
    }

    async processNewTransactions(
        callback: (transactions: TransactionData[]) => Promise<void>
    ): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;
            const commitment: Commitment = 'confirmed';
            
            const currentSlot = await this.retryWithBackoff(() => 
                this.connection.getSlot(commitment)
            );

            if (this.lastProcessedSlot === 0) {
                this.lastProcessedSlot = currentSlot - 1;
            }

            const currentProgram = this.raydiumPrograms[this.currentRaydiumIndex];
            this.logger.info(`Processing transactions for program ${currentProgram.toString()}`);

            const signatures = await this.retryWithBackoff(() =>
                this.connection.getSignaturesForAddress(
                    currentProgram,
                    { 
                        limit: this.BATCH_SIZE,
                        before: undefined
                    }
                )
            );

            if (signatures.length === 0) {
                this.currentRaydiumIndex = (this.currentRaydiumIndex + 1) % this.raydiumPrograms.length;
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 5000));

            const transactions: TransactionData[] = [];
            for (const sig of signatures) {
                try {
                    const tx = await this.retryWithBackoff(() =>
                        this.connection.getParsedTransaction(
                            sig.signature,
                            {
                                maxSupportedTransactionVersion: 0,
                                commitment
                            }
                        )
                    );

                    if (tx) {
                        const processedTx = this.processParsedTransaction(tx, sig.signature);
                        if (processedTx) {
                            transactions.push(processedTx);
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    this.logger.error('Error fetching transaction', {
                        signature: sig.signature,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                        user: 'klakrketn'
                    });
                }
            }

            if (transactions.length > 0) {
                await callback(transactions);
                this.lastProcessedSlot = currentSlot;
                
                this.logger.info('Processed transactions batch', {
                    count: transactions.length,
                    currentSlot,
                    lastProcessedSlot: this.lastProcessedSlot,
                    programId: currentProgram.toString(),
                    timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                    user: 'klakrketn'
                });
            }

            this.currentRaydiumIndex = (this.currentRaydiumIndex + 1) % this.raydiumPrograms.length;

        } catch (error) {
            this.logger.error('Error in processNewTransactions', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
        } finally {
            this.isProcessing = false;
        }
    }

    private processParsedTransaction(
        tx: ParsedTransactionWithMeta,
        signature: TransactionSignature
    ): TransactionData | null {
        try {
            if (!tx.blockTime) {
                return null;
            }
    
            const programId = tx.transaction.message.accountKeys[0].pubkey.toString();
            const tokenTransfers = this.extractTokenTransfers(tx, signature);
    
            if (tokenTransfers.length === 0) {
                return null;
            }
    
            const transactionData: TransactionData = {
                signature,
                type: 'token_swap',
                timestamp: tx.blockTime * 1000,
                blockTime: tx.blockTime,
                programId,
                accountKeys: tx.transaction.message.accountKeys.map(key => 
                    key.pubkey.toString()
                ),
                tokenTransfers: tokenTransfers.map(transfer => ({
                    mint: transfer.mint,
                    amount: transfer.amount,
                    price: 0,
                    decimals: 0,
                    fromUserAccount: transfer.fromUserAccount,
                    toUserAccount: transfer.toUserAccount
                })),
                meta: {
                    err: tx.meta?.err,
                    fee: tx.meta?.fee || 0,
                    postBalances: tx.meta?.postBalances || [],
                    preBalances: tx.meta?.preBalances || [],
                    innerInstructions: tx.meta?.innerInstructions || []
                },
                instructionData: this.extractInstructionData(tx)
            };
    
            return transactionData;
    
        } catch (error) {
            this.logger.error('Error processing transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                signature,
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
            return null;
        }
    }

    private extractTokenTransfers(
        tx: ParsedTransactionWithMeta,
        signature: TransactionSignature
    ): TokenTransfer[] {
        const transfers: TokenTransfer[] = [];

        try {
            if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) {
                return transfers;
            }

            const preBalances = new Map<number, TokenBalance>(
                tx.meta.preTokenBalances.map(balance => [balance.accountIndex, balance])
            );

            tx.meta.postTokenBalances.forEach(postBalance => {
                const preBalance = preBalances.get(postBalance.accountIndex);
                if (!preBalance || !postBalance.mint) return;

                const amountChange = (postBalance.uiTokenAmount.uiAmount || 0) -
                                   (preBalance.uiTokenAmount.uiAmount || 0);

                if (amountChange !== 0) {
                    transfers.push({
                        mint: postBalance.mint,
                        fromUserAccount: tx.transaction.message.accountKeys[postBalance.accountIndex].pubkey.toString(),
                        toUserAccount: tx.transaction.message.accountKeys[postBalance.accountIndex].pubkey.toString(),
                        amount: amountChange.toString(),
                        timestamp: tx.blockTime ? tx.blockTime * 1000 : undefined,
                        signature
                    });
                }
            });

        } catch (error) {
            this.logger.error('Error extracting token transfers', {
                error: error instanceof Error ? error.message : 'Unknown error',
                signature,
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
        }

        return transfers;
    }

    private extractInstructionData(tx: ParsedTransactionWithMeta): string {
        try {
            const instruction = tx.transaction.message.instructions[0];
            if (!instruction) return '';

            if ('data' in instruction && typeof instruction.data === 'string') {
                return instruction.data;
            }

            if ('parsed' in instruction) {
                return JSON.stringify(instruction.parsed);
            }

            return '';
        } catch (error) {
            this.logger.error('Error extracting instruction data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
            return '';
        }
    }

    async getAccountBalance(address: string): Promise<number> {
        try {
            const balance = await this.retryWithBackoff(() =>
                this.connection.getBalance(new PublicKey(address))
            );
            return balance / 1e9;
        } catch (error) {
            this.logger.error('Error getting account balance', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address,
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }

    async getTokenBalance(
        owner: string,
        tokenMint: string
    ): Promise<number> {
        try {
            const accounts = await this.retryWithBackoff(() =>
                this.connection.getParsedTokenAccountsByOwner(
                    new PublicKey(owner),
                    { mint: new PublicKey(tokenMint) }
                )
            );

            if (accounts.value.length === 0) {
                return 0;
            }

            return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;

        } catch (error) {
            this.logger.error('Error getting token balance', {
                error: error instanceof Error ? error.message : 'Unknown error',
                owner,
                tokenMint,
                timestamp: new Date('2025-02-21T21:05:18Z').toISOString(),
                user: 'klakrketn'
            });
            return 0;
        }
    }
}