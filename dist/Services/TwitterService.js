"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterService = void 0;
const axios_1 = __importDefault(require("axios"));
const limiter_1 = require("limiter");
class TwitterService {
    constructor(logger) {
        this.logger = logger;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 минут
        if (!process.env.TWITTER_BEARER_TOKEN) {
            throw new Error('TWITTER_BEARER_TOKEN not found in environment variables');
        }
        this.axiosInstance = axios_1.default.create({
            baseURL: 'https://api.twitter.com/2',
            headers: {
                'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        // Ограничиваем запросы до 450 в 15 минут
        this.limiter = new limiter_1.RateLimiter({
            tokensPerInterval: 450,
            interval: "15 minutes"
        });
        this.cache = new Map();
    }
    async getSentimentForToken(token) {
        try {
            // Проверяем кэш
            const cached = this.cache.get(token);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug('Returning cached sentiment', { token });
                return cached.sentiment;
            }
            // Ожидаем доступный токен для запроса
            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get('/tweets/search/recent', {
                params: {
                    query: `${token} crypto -is:retweet lang:en`,
                    max_results: 100,
                    tweet, : .fields, 'created_at,public_metrics': ,
                    expansions: 'author_id'
                }
            });
            const tweets = response.data.data || [];
            if (tweets.length === 0) {
                this.logger.debug('No tweets found', { token });
                return 0;
            }
            const sentiment = this.analyzeSentiment(tweets);
            // Сохраняем в кэш
            this.cache.set(token, {
                sentiment,
                timestamp: Date.now()
            });
            this.logger.info('Sentiment analysis completed', {
                token,
                tweetCount: tweets.length,
                sentiment
            });
            return sentiment;
        }
        catch (error) {
            this.logger.error('Error fetching Twitter sentiment', {
                error: error instanceof Error ? error.message : 'Unknown error',
                token,
                timestamp: new Date().toISOString()
            });
            return 0;
        }
    }
    analyzeSentiment(tweets) {
        if (tweets.length === 0)
            return 0;
        let totalScore = 0;
        let totalWeight = 0;
        for (const tweet of tweets) {
            const metrics = tweet.public_metrics;
            // Рассчитываем вес твита на основе метрик взаимодействия
            const weight = this.calculateTweetWeight(metrics);
            // Анализируем текст твита
            const textSentiment = this.analyzeTextSentiment(tweet.text);
            totalScore += textSentiment * weight;
            totalWeight += weight;
        }
        // Нормализуем результат от -1 до 1
        return totalWeight > 0 ? (totalScore / totalWeight) : 0;
    }
    calculateTweetWeight(metrics) {
        return (metrics.like_count * 1.0 +
            metrics.retweet_count * 2.0 +
            metrics.quote_count * 1.5 +
            metrics.reply_count * 0.5) + 1; // Добавляем 1, чтобы твиты без взаимодействий тоже учитывались
    }
    analyzeTextSentiment(text) {
        const positiveWords = new Set([
            'bull', 'bullish', 'moon', 'pump', 'buy', 'long',
            'good', 'great', 'amazing', 'profit', 'win', 'winning',
            'gain', 'gains', 'up', 'rising', 'grow', 'growing'
        ]);
        const negativeWords = new Set([
            'bear', 'bearish', 'dump', 'sell', 'short',
            'bad', 'worst', 'terrible', 'loss', 'lose', 'losing',
            'down', 'falling', 'crash', 'scam', 'fake'
        ]);
        const words = text.toLowerCase().split(/\W+/);
        let score = 0;
        for (const word of words) {
            if (positiveWords.has(word))
                score += 1;
            if (negativeWords.has(word))
                score -= 1;
        }
        // Нормализуем оценку от -1 до 1
        return score === 0 ? 0 : score / Math.abs(score);
    }
    async getTrendingTokens() {
        try {
            await this.limiter.removeTokens(1);
            const response = await this.axiosInstance.get('/tweets/search/recent', {
                params: {
                    query: 'solana crypto token -is:retweet lang:en',
                    max_results: 100,
                    tweet, : .fields, 'public_metrics': 
                }
            });
            const tweets = response.data.data || [];
            const tokenMentions = new Map();
            // Извлекаем упоминания токенов и считаем их
            for (const tweet of tweets) {
                const tokens = this.extractTokenMentions(tweet.text);
                tokens.forEach(token => {
                    tokenMentions.set(token, (tokenMentions.get(token) || 0) + 1);
                });
            }
            // Сортируем токены по количеству упоминаний
            return Array.from(tokenMentions.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([token]) => token);
        }
        catch (error) {
            this.logger.error('Error fetching trending tokens', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return [];
        }
    }
    extractTokenMentions(text) {
        // Ищем упоминания токенов по паттернам
        const tokenPatterns = [
            /\$[A-Z]+/g, // $SOL, $BTC
            /[A-Z]{2,10}\/SOL/g, // TOKEN/SOL
            /@[A-Za-z0-9_]+/g // @project_name
        ];
        const mentions = new Set();
        tokenPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach(match => mentions.add(match));
            }
        });
        return Array.from(mentions);
    }
    async getTokenMentionMetrics(token, timeWindow = '24h') {
        try {
            await this.limiter.removeTokens(1);
            const startTime = new Date();
            startTime.setHours(startTime.getHours() - (timeWindow === '1h' ? 1 : 24));
            const response = await this.axiosInstance.get('/tweets/search/recent', {
                params: {
                    query: `${token} crypto -is:retweet lang:en`,
                    max_results: 100,
                    tweet, : .fields, 'created_at,public_metrics,author_id': ,
                    start_time: startTime.toISOString()
                }
            });
            const tweets = response.data.data || [];
            if (tweets.length === 0) {
                return {
                    mentionCount: 0,
                    uniqueUsers: 0,
                    avgEngagement: 0,
                    sentimentTrend: 0
                };
            }
            const uniqueAuthors = new Set(tweets.map(t => t.author_id));
            const totalEngagement = tweets.reduce((sum, tweet) => {
                const metrics = tweet.public_metrics;
                return sum + this.calculateTweetWeight(metrics);
            }, 0);
            // Расчет тренда настроений
            const timeSegments = timeWindow === '1h' ? 6 : 24; // 10-минутные или часовые сегменты
            const sentimentTrend = this.calculateSentimentTrend(tweets, timeSegments);
            const metrics = {
                mentionCount: tweets.length,
                uniqueUsers: uniqueAuthors.size,
                avgEngagement: totalEngagement / tweets.length,
                sentimentTrend
            };
            this.logger.info('Token mention metrics calculated', {
                token,
                timeWindow,
                metrics,
                timestamp: new Date().toISOString()
            });
            return metrics;
        }
        catch (error) {
            this.logger.error('Error fetching token mention metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                token,
                timeWindow,
                timestamp: new Date().toISOString()
            });
            return {
                mentionCount: 0,
                uniqueUsers: 0,
                avgEngagement: 0,
                sentimentTrend: 0
            };
        }
    }
    calculateSentimentTrend(tweets, segments) {
        if (tweets.length < 2)
            return 0;
        // Сортируем твиты по времени
        const sortedTweets = [...tweets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        // Разбиваем на временные сегменты
        const segmentSize = Math.ceil(sortedTweets.length / segments);
        const sentiments = [];
        for (let i = 0; i < sortedTweets.length; i += segmentSize) {
            const segmentTweets = sortedTweets.slice(i, i + segmentSize);
            const segmentSentiment = this.analyzeSentiment(segmentTweets);
            sentiments.push(segmentSentiment);
        }
        // Рассчитываем тренд как разницу между средним sentiment последней и первой трети сегментов
        const thirdSize = Math.ceil(sentiments.length / 3);
        const firstThird = sentiments.slice(0, thirdSize);
        const lastThird = sentiments.slice(-thirdSize);
        const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
        const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
        return lastAvg - firstAvg;
    }
}
exports.TwitterService = TwitterService;
