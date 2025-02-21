"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    constructor(maxRequests, interval) {
        this.maxRequests = maxRequests;
        this.interval = interval;
        this.timestamps = [];
    }
    async waitForSlot() {
        const now = Date.now();
        // Удаляем устаревшие timestamps
        this.timestamps = this.timestamps.filter(timestamp => now - timestamp < this.interval);
        if (this.timestamps.length >= this.maxRequests) {
            // Ждем, пока освободится слот
            const oldestTimestamp = this.timestamps[0];
            const waitTime = this.interval - (now - oldestTimestamp);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            // Рекурсивно проверяем снова после ожидания
            return this.waitForSlot();
        }
        this.timestamps.push(now);
    }
}
exports.RateLimiter = RateLimiter;
