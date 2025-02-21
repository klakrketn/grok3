import * as winston from 'winston';
import axios from 'axios';
import { 
    TransactionData,
    PositionTradeMetrics,
    MarketTradeMetrics 
} from '../types/PumpFunTypes';

// Добавляем rate limiting и retry механизмы
import { RateLimiter } from '../utils/RateLimiter';

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
    timestamp: number; // Добавляем timestamp для отслеживания устаревших анализов
}

interface OpenRouterResponse {
    choices: {
        message: {
            content: string;
            role: string;
        };
        finish_reason: string;
    }[];
    error?: {
        message: string;
        type: string;
    };
}

export class DeepSeekService {
    private readonly apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
    private readonly headers: Record<string, string>;
    private readonly rateLimiter: RateLimiter;
    private readonly retryDelay = 1000; // 1 секунда
    private readonly maxRetries = 3;

    constructor(
        private readonly logger: winston.Logger,
        private readonly timeout: number = 30000 // 30 секунд таймаут
    ) {
        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('OPENROUTER_API_KEY not found in environment variables');
        }

        this.headers = {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.SITE_URL || 'https://github.com/klakrketn/grok2',
            'X-Title': 'Solana Pump Bot',
            'Content-Type': 'application/json'
        };

        // Инициализируем rate limiter: 10 запросов в минуту
        this.rateLimiter = new RateLimiter(10, 60000);

        this.logger.info('DeepSeekService initialized', {
            maxRetries: this.maxRetries,
            timeout: this.timeout,
            rateLimit: '10 requests per minute'
        });
    }

    async analyzeTransaction(tx: TransactionData): Promise<DeepSeekAnalysis> {
        try {
            // Ждем доступного слота согласно rate limiting
            await this.rateLimiter.waitForSlot();

            let lastError: Error | null = null;
            
            for (let attempt = 0; attempt < this.maxRetries; attempt++) {
                try {
                    const prompt = this.createAnalysisPrompt(tx);
                    
                    const response = await axios.post<OpenRouterResponse>(
                        this.apiUrl,
                        {
                            model: 'deepseek/deepseek-r1-distill-llama-8b',
                            messages: [
                                {
                                    role: 'system',
                                    content: this.getSystemPrompt()
                                },
                                {
                                    role: 'user',
                                    content: prompt
                                }
                            ]
                        },
                        { 
                            headers: this.headers,
                            timeout: this.timeout 
                        }
                    );

                    if (response.data.error) {
                        throw new Error(`API Error: ${response.data.error.message}`);
                    }

                    const analysis = this.parseResponse(response.data);

                    this.logger.info('Transaction analysis completed', {
                        signature: tx.signature,
                        action: analysis.action,
                        confidence: analysis.confidence,
                        riskLevel: analysis.riskLevel,
                        attempt: attempt + 1,
                        timestamp: new Date().toISOString()
                    });

                    return {
                        ...analysis,
                        timestamp: Date.now()
                    };

                } catch (error) {
                    lastError = error instanceof Error ? error : new Error('Unknown error');
                    
                    if (attempt < this.maxRetries - 1) {
                        this.logger.warn(`Retry attempt ${attempt + 1} failed`, {
                            error: lastError.message,
                            signature: tx.signature
                        });
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempt + 1)));
                    }
                }
            }

            throw lastError || new Error('All retry attempts failed');

        } catch (error) {
            this.logger.error('Error analyzing transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                signature: tx.signature,
                timestamp: new Date().toISOString()
            });
            
            return {
                action: 'HOLD',
                confidence: 0,
                reasoning: ['Error during analysis: ' + (error instanceof Error ? error.message : 'Unknown error')],
                riskLevel: 'HIGH',
                timestamp: Date.now()
            };
        }
    }

    private getSystemPrompt(): string {
        return `You are an expert crypto trading assistant specializing in Solana memecoins analysis. 
        Analyze transactions and provide clear trading recommendations with confidence scores and risk assessment.
        Focus on patterns that indicate potential pump and dump schemes, whale movements, and market manipulation.
        Consider liquidity, volume, and historical patterns in your analysis.
        Provide concrete price targets and stop-loss levels when possible.
        Always err on the side of caution and highlight potential risks.`;
    }

    private createAnalysisPrompt(tx: TransactionData): string {
        return `Analyze this Solana transaction for trading opportunities:

Transaction Details:
- Signature: ${tx.signature}
- Token Transfers: ${JSON.stringify(tx.tokenTransfers)}
- Timestamp: ${new Date(tx.timestamp).toISOString()}
- Block Time: ${tx.blockTime}
- Account Keys: ${tx.accountKeys.join(', ')}

Additional Context:
- Current Time: ${new Date().toISOString()}
- Time Since Transaction: ${Date.now() - tx.timestamp}ms

Please provide analysis in the following JSON format:
{
    "action": "BUY/SELL/HOLD",
    "confidence": <0-1>,
    "reasoning": ["reason1", "reason2"],
    "riskLevel": "LOW/MEDIUM/HIGH",
    "suggestedEntry": <price>,
    "suggestedExit": <price>,
    "stopLoss": <price>,
    "predictedProfit": <percentage>,
    "marketSentiment": "string"
}`;
    }

    private parseResponse(response: OpenRouterResponse): DeepSeekAnalysis {
        try {
            const content = response.choices[0]?.message.content;
            if (!content) {
                throw new Error('Empty response from API');
            }

            // Извлекаем JSON из ответа
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const analysis = JSON.parse(jsonMatch[0]);

            // Валидация и нормализация данных
            return {
                action: this.validateAction(analysis.action),
                confidence: this.normalizeConfidence(analysis.confidence),
                reasoning: this.validateReasoning(analysis.reasoning),
                riskLevel: this.validateRiskLevel(analysis.riskLevel),
                suggestedEntry: this.validateNumber(analysis.suggestedEntry),
                suggestedExit: this.validateNumber(analysis.suggestedExit),
                stopLoss: this.validateNumber(analysis.stopLoss),
                predictedProfit: this.validateNumber(analysis.predictedProfit),
                marketSentiment: this.validateString(analysis.marketSentiment),
                timestamp: Date.now()
            };

        } catch (error) {
            this.logger.error('Error parsing API response', {
                error: error instanceof Error ? error.message : 'Unknown error',
                response: response
            });

            return {
                action: 'HOLD',
                confidence: 0,
                reasoning: ['Error parsing response: ' + (error instanceof Error ? error.message : 'Unknown error')],
                riskLevel: 'HIGH',
                timestamp: Date.now()
            };
        }
    }

    private validateAction(action: string): 'BUY' | 'SELL' | 'HOLD' {
        action = String(action).toUpperCase();
        if (action === 'BUY' || action === 'SELL' || action === 'HOLD') {
            return action;
        }
        return 'HOLD';
    }

    private normalizeConfidence(confidence: number): number {
        if (typeof confidence !== 'number' || isNaN(confidence)) {
            return 0;
        }
        return Math.max(0, Math.min(1, confidence));
    }

    private validateRiskLevel(level: string): 'LOW' | 'MEDIUM' | 'HIGH' {
        level = String(level).toUpperCase();
        if (level === 'LOW' || level === 'MEDIUM' || level === 'HIGH') {
            return level;
        }
        return 'HIGH';
    }

    private validateReasoning(reasoning: unknown): string[] {
        if (Array.isArray(reasoning)) {
            return reasoning
                .map(r => String(r))
                .filter(r => r.length > 0);
        }
        return ['No reasoning provided'];
    }

    private validateNumber(value: unknown): number | undefined {
        if (typeof value === 'number' && !isNaN(value)) {
            return value;
        }
        return undefined;
    }

    private validateString(value: unknown): string | undefined {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
        return undefined;
    }
}