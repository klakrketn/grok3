"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmgnService = void 0;
const axios_1 = __importDefault(require("axios"));
const web3_js_1 = require("@solana/web3.js");
const limiter_1 = require("limiter");
class GmgnService {
    constructor(logger) {
        this.logger = logger;
        this.CACHE_TTL = 15 * 60 * 1000; // 15 минут
        this.connection = new web3_js_1.Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');
        this.axiosInstance = axios_1.default.create({
            baseURL: 'https://api.gmgn.ai/v1',
            headers: {
                'Authorization': `Bearer ${process.env.GMGN_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        // Ограничиваем запросы до 100 в минуту
        this.limiter = new limiter_1.RateLimiter({
            tokensPerInterval: 100,
            interval: "minute"
        });
        this.cache = new Map();
    }
    async getWalletData(wallet) {
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
            const response = await this.axiosInstance.get(`/wallet/${wallet}`);
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
        }
        catch (error) {
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
    async performBasicCheck(wallet) {
        try {
            const publicKey = new web3_js_1.PublicKey(wallet);
            // Получаем баланс
            const balance = await this.connection.getBalance(publicKey);
            const balanceInSol = balance / 1e9;
            // Получаем историю транзакций
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 100 });
            // Анализируем активность
            const recentActivity = signatures.filter(sig => (Date.now() - sig.blockTime * 1000) < 24 * 60 * 60 * 1000).length;
            return {
                isSuspicious: recentActivity > 50 || // Подозрительно много транзакций за 24 часа
                    signatures.length < 5, // Слишком новый аккаунт
                isWhale: balanceInSol > 1000 // Более 1000 SOL считаем китом
            };
        }
        catch (error) {
            this.logger.error('Error performing basic wallet check', {
                error: error instanceof Error ? error.message : 'Unknown error',
                wallet
            });
            return { isSuspicious: true, isWhale: false };
        }
    }
    cacheResult(wallet, result) {
        this.cache.set(wallet, {
            data: result,
            timestamp: Date.now()
        });
    }
    async isContractSuspicious(contract) {
        try {
            if (!process.env.GMGN_API_KEY) {
                return false; // Без API ключа считаем контракты безопасными
            }
            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get(`/contract/${contract}`);
            return response.data.contract.risk_score > 0.7;
        }
        catch (error) {
            this.logger.error('Error checking contract', {
                error: error instanceof Error ? error.message : 'Unknown error',
                contract
            });
            return true; // В случае ошибки считаем контракт подозрительным
        }
    }
    async getContractMetadata(contract) {
        try {
            if (!process.env.GMGN_API_KEY) {
                return null;
            }
            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get(`/contract/${contract}/metadata`);
            return response.data.metadata;
        }
        catch (error) {
            this.logger.error('Error fetching contract metadata', {
                error: error instanceof Error ? error.message : 'Unknown error',
                contract
            });
            return null;
        }
    }
}
exports.GmgnService = GmgnService;
