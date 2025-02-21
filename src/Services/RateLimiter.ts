export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number;
    private readonly refillInterval: number = 1000; // 1 секунда в миллисекундах

    constructor(
        maxTokens: number,
        refillRate: number // токенов в секунду
    ) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = refillRate;
        this.lastRefill = Date.now();
    }

    async waitForToken(): Promise<void> {
        await this.refill();
        
        if (this.tokens < 1) {
            const waitTime = Math.ceil(1000 / this.refillRate);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            await this.refill();
        }
        
        this.tokens -= 1;
    }

    private async refill(): Promise<void> {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const refill = Math.floor((timePassed * this.refillRate) / 1000);
        
        if (refill > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + refill);
            this.lastRefill = now;
        }
    }

    getTokens(): number {
        return this.tokens;
    }

    reset(): void {
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }

    async tryConsume(tokens: number = 1): Promise<boolean> {
        await this.refill();
        
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        
        return false;
    }

    async consume(tokens: number = 1): Promise<void> {
        while (!(await this.tryConsume(tokens))) {
            await new Promise(resolve => setTimeout(resolve, this.refillInterval));
        }
    }

    getTimeToNextToken(): number {
        if (this.tokens > 0) return 0;
        
        const timeSinceLastRefill = Date.now() - this.lastRefill;
        const timeToNextToken = (1000 / this.refillRate) - timeSinceLastRefill;
        
        return Math.max(0, Math.ceil(timeToNextToken));
    }

    getRemainingTokens(): number {
        this.refill();
        return this.tokens;
    }

    getRefillRate(): number {
        return this.refillRate;
    }

    getMaxTokens(): number {
        return this.maxTokens;
    }

    setMaxTokens(newMax: number): void {
        this.maxTokens = Math.max(1, newMax);
        this.tokens = Math.min(this.tokens, this.maxTokens);
    }

    setRefillRate(newRate: number): void {
        if (newRate <= 0) {
            throw new Error('Refill rate must be greater than 0');
        }
        this.refillRate = newRate;
    }

    isExhausted(): boolean {
        return this.tokens === 0;
    }

    async waitUntilRefill(): Promise<void> {
        if (this.tokens > 0) return;
        
        const waitTime = this.getTimeToNextToken();
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        await this.refill();
    }
}