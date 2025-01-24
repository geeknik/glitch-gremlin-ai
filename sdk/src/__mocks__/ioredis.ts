import type { RedisConfig } from '../types';

export class IoRedisMock implements RedisConfig {
    private data: Map<string, any>;
    private keyPrefix: string;
    public host: string;
    public port: number;
    public maxRetriesPerRequest?: number;
    public connectTimeout?: number;
    public retryStrategy?: (times: number) => number | null;

    constructor(config: any = { 
        data: new Map<string, any>(),
        keyPrefix: 'test',
        host: 'localhost',
        port: 6379
    }) {
        this.data = config.data;
        this.keyPrefix = config.keyPrefix;
        this.host = config.host;
        this.port = config.port;
    }

    async flushall(): Promise<void> {
        this.data.clear();
    }

    lrange = jest.fn().mockResolvedValue(['instruction1', 'instruction2']);
    incr = jest.fn().mockResolvedValue(1);
    expire = jest.fn().mockResolvedValue(1);
    get = jest.fn().mockResolvedValue(null);
    set = jest.fn().mockResolvedValue('OK');
    on = jest.fn().mockReturnValue(this);
    quit = jest.fn().mockResolvedValue('OK');
    disconnect = jest.fn().mockResolvedValue(undefined);
    hset = jest.fn().mockResolvedValue(1);
    hget = jest.fn().mockResolvedValue(null);
    lpush = jest.fn().mockResolvedValue(1);
    rpop = jest.fn().mockResolvedValue(null);
}
