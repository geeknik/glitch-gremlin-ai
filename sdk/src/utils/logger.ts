import { EventEmitter } from 'events';

export class Logger extends EventEmitter {
    private name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }

    info(message: string) {
        console.log(`[${this.name}] INFO: ${message}`);
    }

    error(message: string) {
        console.error(`[${this.name}] ERROR: ${message}`);
    }
}