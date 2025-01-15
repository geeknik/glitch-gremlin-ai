import { EventEmitter } from 'events';

export class Logger extends EventEmitter {
    private name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }

    info(message: string): void {
        console.log(`[${this.name}] INFO: ${message}`);
    }

    debug(message: string): void {
        console.debug(`[${this.name}] DEBUG: ${message}`);
    }
    warn(message: string): void {
        console.warn(`[${this.name}] WARN: ${message}`);
    }

    error(message: string): void {
    error(message: string): void {
        console.error(`[${this.name}] ERROR: ${message}`);
    }
}
