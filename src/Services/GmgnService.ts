import * as winston from 'winston';
import axios, { AxiosInstance } from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { RateLimiter } from 'limiter';

interface GmgnResponse {
    wallet: {
        risk_score: number;
        is_whale: boolean;
        total_volume: number;
        success_rate: number;
        transaction_count: number;
        last_active: string;
        associated_contracts: string[];
    };
}

export class GmgnService {
    private axiosInstance: AxiosInstance;
    private connection: Connection;
    private limiter: RateLimiter;
    private cache: Map<string, {
        data: { isSuspicious: boolean; isWhale: boolean };
        timestamp: number;
    }>;
    private readonly CACHE_TTL = 15 * 60 * 1000; // 15 минут

    constructor(
        private logger: winston.Logger
    ) {
        this.connection = new Connection(
            process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
            'confirmed'
        );

        this.axiosInstance = axios.create({
            baseURL: 'https://api.gmgn.ai/v1',
            headers: {
                'Authorization': `Bearer ${process.env.GMGN_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Ограничиваем запросы до 100 в минуту
        this.limiter = new RateLimiter({
            tokensPerInterval: 100,
            interval: "minute"
        });

        this.cache = new Map();
    }

    async getWalletData(wallet: string): Promise<{ 
        isSuspicious: boolean; 
        isWhale: boolean;
        metadata?: {
            riskScore: number;
            totalVolume: number;
            successRate: number;
            transactionCount: number;
            lastActive: Date;
            associatedContracts: string[];
        }
    }> {
        try {
            // Проверяем кэш
            const cached = this.cache.get(wallet);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.data;
            }

            // Если нет API ключа, используем базовую проверку
            if (!process.env.GMGN_API_KEY) {
                const basicCheck = await this.performBasicCheck(wallet);
                this.cacheResult(wallet, basicCheck);
                return basicCheck;
            }

            // Ожидаем доступный токен для запроса
            await this.limiter.removeTokens(1);

            const response = await this.axiosInstance.get<GmgnResponse>(`/wallet/${wallet}`);
            const data = response.data.wallet;

            const result = {
                isSuspicious: data.risk_score > 0.7,
                isWhale: data.is_whale,
                metadata: {
                    riskScore: data.risk_score,
                    totalVolume: data.total_volume,
                    successRate: data.success_rate,
                    transactionCount: data.transaction_count,
                    lastActive: new Date(data.last_active),
                    associatedContracts: data.associated_contracts
                }
            };

            this.cacheResult(wallet, result);
            return result;

        } catch (error) {
            this.logger.error('Error fetching GMGN data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                wallet
            });

            // В случае ошибки выполняем базовую проверку
            const basicCheck = await this.performBasicCheck(wallet);
            this.cacheResult(wallet, basicCheck);
            return basicCheck;
        }
    }

    private async performBasicCheck(wallet: string): Promise<{ 
        isSuspicious: boolean; 
        isWhale: boolean 
    }> {
        try {
            const publicKey = new PublicKey(wallet);
            
            // Получаем баланс
            const balance = await this.connection.getBalance(publicKey);
            const balanceInSol = balance / 1e9;

            // Получаем историю транзакций
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit: 100 }
            );

            // Анализируем активность
            const recentActivity = signatures.filter(
                sig => (Date.now() - sig.blockTime! * 1000) < 24 * 60 * 60 * 1000
            ).length;

            return {
                isSuspicious: recentActivity > 50 || // Подозрительно много транзакций за 24 часа
                             signatures.length < 5,  // Слишком новый аккаунт
                isWhale: balanceInSol > 1000 // Более 1000 SOL считаем китом
            };

        } catch (error) {
            this.logger.error('Error performing basic wallet check', {
                error: error instanceof Error ? error.message : 'Unknown error',
                wallet
            });
            return { isSuspicious: true, isWhale: false };
        }
    }

    private cacheResult(
        wallet: string, 
        result: { isSuspicious: boolean; isWhale: boolean }
    ): void {
        this.cache.set(wallet, {
            data: result,
            timestamp: Date.now()
        });
    }

    async isContractSuspicious(contract: string): Promise<boolean> {
        try {
            if (!process.env.GMGN_API_KEY) {
                return false; // Без API ключа считаем контракты безопасными
            }

            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get(`/contract/${contract}`);
            
            return response.data.contract.risk_score > 0.7;

        } catch (error) {
            this.logger.error('Error checking contract', {
                error: error instanceof Error ? error.message : 'Unknown error',
                contract
            });
            return true; // В случае ошибки считаем контракт подозрительным
        }
    }

    async getContractMetadata(contract: string): Promise<{
        name: string;
        symbol: string;
        totalSupply: number;
        holderCount: number;
        verified: boolean;
    } | null> {
        try {
            if (!process.env.GMGN_API_KEY) {
                return null;
            }

            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get(`/contract/${contract}/metadata`);
            
            return response.data.metadata;

        } catch (error) {
            this.logger.error('Error fetching contract metadata', {
                error: error instanceof Error ? error.message : 'Unknown error',
                contract
            });
            return null;
        }
    }
}