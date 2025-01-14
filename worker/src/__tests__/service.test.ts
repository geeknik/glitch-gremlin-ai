import { GlitchService } from '../service';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';

jest.mock('@opentelemetry/exporter-prometheus');
jest.mock('@opentelemetry/api');
jest.mock('@opentelemetry/sdk-metrics');

import { MeterProvider } from '@opentelemetry/sdk-metrics';

describe('GlitchService', () => {
    let service: GlitchService;
    let mockExporter: jest.Mocked<PrometheusExporter>;
    let mockMeter: jest.Mocked<any>;
    let mockMeterProvider: jest.Mocked<MeterProvider>;

    beforeEach(() => {
        mockExporter = {
            startServer: jest.fn().mockResolvedValue(undefined),
            shutdown: jest.fn().mockResolvedValue(undefined),
            getMeterProvider: jest.fn()
        } as any;

        mockMeter = {
            createCounter: jest.fn().mockReturnValue({
                add: jest.fn()
            }),
            createGauge: jest.fn().mockReturnValue({
                update: jest.fn()
            })
        };

        mockMeterProvider = {
            getMeter: jest.fn().mockReturnValue(mockMeter)
        } as any;

        (MeterProvider as jest.Mock).mockImplementation(() => mockMeterProvider);
        (PrometheusExporter as jest.Mock).mockImplementation(() => mockExporter);
        (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);

        service = new GlitchService();
    });

    afterEach(async () => {
        if (service) {
            await service.stop();
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow cleanup to complete
        }
        jest.clearAllMocks();
        jest.resetModules();
    });

    describe('start', () => {
        it('should initialize metrics and start server', async () => {
            expect.assertions(8);
            await service.start();

            expect(MeterProvider).toHaveBeenCalled();
            expect(PrometheusExporter).toHaveBeenCalledWith({
                port: 9464,
                endpoint: '/metrics'
            });
            expect(mockExporter.startServer).toHaveBeenCalled();
            expect(mockMeterProvider.getMeter).toHaveBeenCalledWith('glitch-service');
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
