import type { Redis as RedisClient } from 'ioredis';
import { RedisConfig } from '../types.js';
import { createRedisClient, createRedisMockClient } from './redis-client.js';

export class RedisFactory {
    private static instance: RedisClient | null = null;

    public static async createInstance(config: RedisConfig, isTesting = false): Promise<RedisClient> {
        if (this.instance) {
            return this.instance;
        }

        try {
            const client = isTesting 
                ? await createRedisMockClient(config)
                : await createRedisClient(config);

            // Handle connection events
            client.on('connect', () => {
                console.log('Redis client connected');
            });

            client.on('error', (err: Error) => {
                console.error('Redis client error:', err);
            });

            client.on('close', () => {
                console.log('Redis client connection closed');
            });

            // Store the instance
            this.instance = client;

            // Test the connection
            if (!isTesting) {
                await client.ping();
            }
            
            return client;
        } catch (error) {
            console.error('Failed to create Redis instance:', error);
            throw error;
        }
    }

    public static async getInstance(): Promise<RedisClient> {
        if (!this.instance) {
            throw new Error('Redis instance not initialized. Call createInstance first.');
        }
        return this.instance;
    }

    public static async closeConnection(): Promise<void> {
        if (this.instance) {
            try {
                await this.instance.quit();
            } catch (error) {
                console.error('Error closing Redis connection:', error);
            } finally {
                this.instance = null;
            }
        }
    }
} 
