export class IoRedisMock {
    private data: Map<string, any>;
    private keyPrefix: string;

    constructor(config: { data: Map<string, any>; keyPrefix: string }) {
        this.data = config.data;
        this.keyPrefix = config.keyPrefix;
    }

    async flushall(): Promise<void> {
        this.data.clear();
    }

    lrange = jest.fn().mockResolvedValue(['instruction1', 'instruction2']);
}
