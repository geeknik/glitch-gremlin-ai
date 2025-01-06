import { GlitchService } from './service';

async function main() {
    const service = new GlitchService();
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
        console.log('Shutting down service...');
        await service.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('Shutting down service...');
        await service.stop();
        process.exit(0);
    });

    await service.start();
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
