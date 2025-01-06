import { GlitchService } from '../service';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';

jest.mock('@opentelemetry/exporter-prometheus');
jest.mock('@opentelemetry/api');

describe('GlitchService', () => {
    let service: GlitchService;
    let mockExporter: jest.Mocked<PrometheusExporter>;
    let mockMeter: jest.Mocked<any>;

    beforeEach(() => {
        mockExporter = {
            startServer: jest.fn().mockResolvedValue(undefined),
            shutdown: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockMeter = {
            createCounter: jest.fn(),
            createGauge: jest.fn()
        };

        (PrometheusExporter as jest.Mock).mockImplementation(() => mockExporter);
        (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);

        service = new GlitchService();
    });

    afterEach(async () => {
        await service.stop();
        jest.clearAllMocks();
    });

    describe('start', () => {
        it('should initialize metrics and start server', async () => {
            await service.start();

            expect(PrometheusExporter).toHaveBeenCalledWith({
                port: 9464,
                endpoint: '/metrics'
            });
            expect(mockExporter.startServer).toHaveBeenCalled();
            expect(mockMeter.createCounter).toHaveBeenCalledWith('glitch_requests_total');
            expect(mockMeter.createGauge).toHaveBeenCalledWith('glitch_active_tests');
            expect(mockMeter.createGauge).toHaveBeenCalledWith('glitch_queue_depth');
            expect(mockMeter.createCounter).toHaveBeenCalledWith('glitch_errors_total');
        });

        it('should handle startup errors', async () => {
            const error = new Error('Failed to start server');
            mockExporter.startServer.mockRejectedValueOnce(error);

            await expect(service.start()).rejects.toThrow('Failed to start server');
        });
    });

    describe('stop', () => {
        it('should shutdown metrics server gracefully', async () => {
            await service.start();
            await service.stop();

            expect(mockExporter.shutdown).toHaveBeenCalled();
        });

        it('should handle shutdown errors', async () => {
            const error = new Error('Shutdown failed');
            mockExporter.shutdown.mockRejectedValueOnce(error);

            await service.start();
            await expect(service.stop()).rejects.toThrow('Shutdown failed');
        });
    });
});
