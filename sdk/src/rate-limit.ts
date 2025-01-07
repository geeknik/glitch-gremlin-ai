import { Redis } from 'ioredis.js';
import { GlitchError } from './errors.js';

export async function incrementUsage(redis: Redis, key: string): Promise<number> {
    const count = await redis.incr(key);
    await redis.expire(key, 60); // 60 second window
    return count;
}

export function checkThreshold(count: number, limit: number) {
    if (count > limit) {
        throw new GlitchError('Rate limit exceeded', 1007);
    }
}

export async function checkCooldown(
    redis: Redis, 
    key: string,
    minInterval: number = 2000 // 2 second cooldown
): Promise<void> {
    const lastRequest = await redis.get(key);
    const now = Date.now();
    
    if (lastRequest) {
        const timeSinceLastRequest = now - parseInt(lastRequest);
        if (timeSinceLastRequest < minInterval) {
            throw new GlitchError('Rate limit exceeded', 1007);
        }
    }
    
    await redis.set(key, now.toString());
}
