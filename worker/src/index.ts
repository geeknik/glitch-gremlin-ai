import { QueueListener } from './queue-listener';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
    const listener = new QueueListener(REDIS_URL);
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
        console.log('Shutting down queue listener...');
        await listener.stop();
        process.exit(0);
    });

    await listener.start();
}

main().catch(console.error);
