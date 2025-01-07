import { GlitchError } from './errors';
export async function incrementUsage(redis, key) {
    const count = await redis.incr(key);
    await redis.expire(key, 60); // 60 second window
    return count;
}
export function checkThreshold(count, limit) {
    if (count > limit) {
        throw new GlitchError('Rate limit exceeded', 1007);
    }
}
export async function checkCooldown(redis, key, minInterval = 2000 // 2 second cooldown
) {
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
