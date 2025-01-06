import { TestWorker } from './test-worker';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

async function main() {
    const worker = new TestWorker(REDIS_URL, SOLANA_RPC);
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
        console.log('Shutting down worker...');
        await worker.stop();
        process.exit(0);
    });

    await worker.start();
}

main().catch(console.error);
