import { EventEmitter } from 'events';

export class Logger extends EventEmitter {
    private readonly context: string;

    constructor(context: string) {
        super();
        this.context = context;
    }

    public info(message: string, ...args: any[]): void {
        console.log(`[${this.context}] INFO: ${message}`, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        console.warn(`[${this.context}] WARN: ${message}`, ...args);
    }

    public error(message: string, ...args: any[]): void {
        console.error(`[${this.context}] ERROR: ${message}`, ...args);
    }

    public debug(message: string, ...args: any[]): void {
        console.debug(`[${this.context}] DEBUG: ${message}`, ...args);
    }
}
