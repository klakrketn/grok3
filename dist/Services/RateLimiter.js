"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    constructor(maxTokens, refillRate // токенов в секунду
    ) {
        this.refillInterval = 1000; // 1 секунда в миллисекундах
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = refillRate;
        this.lastRefill = Date.now();
    }
    async waitForToken() {
        await this.refill();
        if (this.tokens < 1) {
            const waitTime = Math.ceil(1000 / this.refillRate);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            await this.refill();
        }
        this.tokens -= 1;
    }
    async refill() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const refill = Math.floor((timePassed * this.refillRate) / 1000);
        if (refill > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + refill);
            this.lastRefill = now;
        }
    }
    getTokens() {
        return this.tokens;
    }
    reset() {
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }
    async tryConsume(tokens = 1) {
        await this.refill();
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        return false;
    }
    async consume(tokens = 1) {
        while (!(await this.tryConsume(tokens))) {
            await new Promise(resolve => setTimeout(resolve, this.refillInterval));
        }
    }
    getTimeToNextToken() {
        if (this.tokens > 0)
            return 0;
        const timeSinceLastRefill = Date.now() - this.lastRefill;
        const timeToNextToken = (1000 / this.refillRate) - timeSinceLastRefill;
        return Math.max(0, Math.ceil(timeToNextToken));
    }
    getRemainingTokens() {
        this.refill();
        return this.tokens;
    }
    getRefillRate() {
        return this.refillRate;
    }
    getMaxTokens() {
        return this.maxTokens;
    }
    setMaxTokens(newMax) {
        this.maxTokens = Math.max(1, newMax);
        this.tokens = Math.min(this.tokens, this.maxTokens);
    }
    setRefillRate(newRate) {
        if (newRate <= 0) {
            throw new Error('Refill rate must be greater than 0');
        }
        this.refillRate = newRate;
    }
    isExhausted() {
        return this.tokens === 0;
    }
    async waitUntilRefill() {
        if (this.tokens > 0)
            return;
        const waitTime = this.getTimeToNextToken();
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        await this.refill();
    }
}
exports.RateLimiter = RateLimiter;
