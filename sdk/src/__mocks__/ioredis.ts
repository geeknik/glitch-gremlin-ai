import type { RedisConfig } from '../types.js';
import { jest } from '@jest/globals';

export class IoRedisMock {
    private store: Map<string, string>;
    public host: string;
    public port: number;
    public password?: string;
    public db?: number;
    public keyPrefix?: string;
    public retryStrategy?: (times: number) => number | null;
    public connected: boolean = false;

    constructor(config: RedisConfig) {
        this.store = new Map();
        this.host = config.host;
        this.port = config.port;
        this.password = config.password;
        this.db = config.db;
        this.keyPrefix = config.keyPrefix;
        this.retryStrategy = config.retryStrategy;
    }

    async connect(): Promise<void> {
        this.connected = true;
    }

    async quit(): Promise<'OK'> {
        this.connected = false;
        return 'OK';
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async get(key: string): Promise<string | null> {
        return this.store.get(key) || null;
    }

    async set(key: string, value: string): Promise<'OK'> {
        this.store.set(key, value);
        return 'OK';
    }

    async incr(key: string): Promise<number> {
        const value = this.store.get(key);
        const newValue = value ? parseInt(value, 10) + 1 : 1;
        this.store.set(key, newValue.toString());
        return newValue;
    }

    async expire(key: string, seconds: number): Promise<number> {
        if (this.store.has(key)) {
            setTimeout(() => {
                this.store.delete(key);
            }, seconds * 1000);
            return 1;
        }
        return 0;
    }

    async lpush(key: string, value: string): Promise<number> {
        const list = JSON.parse(this.store.get(key) || '[]');
        list.unshift(value);
        this.store.set(key, JSON.stringify(list));
        return list.length;
    }

    async rpop(key: string): Promise<string | null> {
        const list = JSON.parse(this.store.get(key) || '[]');
        if (list.length === 0) return null;
        const value = list.pop();
        this.store.set(key, JSON.stringify(list));
        return value;
    }

    async flushall(): Promise<'OK'> {
        this.store.clear();
        return 'OK';
    }

    on(event: string, callback: Function): this {
        // Mock event handling
        return this;
    }
}

export default IoRedisMock;
