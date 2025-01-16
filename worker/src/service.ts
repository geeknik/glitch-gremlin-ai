import { QueueListener } from './queue-listener';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { Logger } from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://r.glitchgremlin.ai:6379';
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9464');

export class GlitchService {
    private queueListener: QueueListener;
    private metricsExporter: PrometheusExporter;
    private logger: Logger;

    constructor() {
        this.logger = new Logger();
        this.queueListener = new QueueListener(REDIS_URL);
        
        // Enable zkVM execution if configured
        this.useZkVM = process.env.USE_ZKVM === 'true';
        if (this.useZkVM) {
            this.logger.info('zkVM execution enabled for enhanced privacy');
        }
        
        // Setup metrics
        this.metricsExporter = new PrometheusExporter({
            port: METRICS_PORT,
            endpoint: '/metrics'
        });

        const meterProvider = new MeterProvider();
        metrics.setGlobalMeterProvider(meterProvider);

        // Create metrics
        const meter = metrics.getMeter('glitch-gremlin');
        meter.createCounter('glitch_requests_total');
        meter.createGauge('glitch_active_tests');
        meter.createGauge('glitch_queue_depth');
        meter.createCounter('glitch_errors_total');
    }

    async start() {
        try {
            this.logger.info('Starting Glitch Gremlin service...');
            
            // Start metrics server
            await this.metricsExporter.startServer();
            this.logger.info(`Metrics server started on port ${METRICS_PORT}`);

            // Start queue listener
            await this.queueListener.start();
            this.logger.info('Queue listener started');
        } catch (error) {
            this.logger.error('Failed to start service:', error);
            throw error;
        }
    }

    async stop() {
        try {
            this.logger.info('Stopping Glitch Gremlin service...');
            await this.queueListener.stop();
            await this.metricsExporter.shutdown();
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
            throw error;
        }
    }
}
