import Redis from 'ioredis'

export class RedisWorker {
    constructor(redisUrl = 'redis://localhost:6379') {
        this.redis = new Redis(redisUrl)
    }

    async connect() {
        try {
            await this.redis.ping()
            console.log('Redis connected')
            return true
        } catch (error) {
            console.error('Redis connection failed:', error)
            return false
        }
    }

    async disconnect() {
        await this.redis.quit()
    }
}
