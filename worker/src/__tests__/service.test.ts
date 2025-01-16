// Service under test
import { GlitchService } from '../service';

// External dependencies
import Redis from 'ioredis';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { Logger } from '../utils/logger';
import { QueueListener } from '../queue-listener';
import { GlitchAIEngine } from '../ai/engine';
import { ZkVMExecutor } from '../zkvm/executor';
import type { Meter, Counter, Histogram } from '@opentelemetry/api';

// Mock all dependencies
jest.mock('ioredis');
jest.mock('../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }))
}));

jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: jest.fn(),
    setGlobalMeterProvider: jest.fn()
  }
}));

jest.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: jest.fn().mockImplementation(() => ({
    getMeter: jest.fn()
  }))
}));

jest.mock('@opentelemetry/exporter-prometheus', () => ({
  PrometheusExporter: jest.fn().mockImplementation(() => ({
    startServer: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../ai/engine', () => ({
  GlitchAIEngine: jest.fn().mockImplementation(() => ({
    executeChaosTest: jest.fn().mockResolvedValue({})
  }))
}));

jest.mock('../zkvm/executor', () => ({
  ZkVMExecutor: jest.fn().mockImplementation(() => ({
    executeTest: jest.fn().mockResolvedValue({})
  }))
}));

jest.mock('../queue-listener');

jest.mock('@opentelemetry/core', () => ({
  createContextKey: jest.fn(),
  baggageUtils: {
    createBaggage: jest.fn()
  }
}));

describe('GlitchService', () => {
  let service: GlitchService;
  let mockRedis: jest.Mocked<Redis>;
  let mockExporter: jest.Mocked<PrometheusExporter>;
  let mockLogger: jest.Mocked<Logger>;
  let mockQueueListener: jest.Mocked<QueueListener>;
  let mockMeter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMeter = {
      createCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
      createGauge: jest.fn().mockReturnValue({ update: jest.fn() })
    };
    (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);
    
    mockRedis = {
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      status: 'ready',
      on: jest.fn(),
      brpop: jest.fn().mockResolvedValue(null),
      hset: jest.fn().mockResolvedValue(1)
    } as any;

    mockExporter = {
      startServer: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<PrometheusExporter>;
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    } as jest.Mocked<Logger>;

    (Logger as jest.Mock).mockImplementation(() => mockLogger);
    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);
    (PrometheusExporter as jest.Mock).mockImplementation(() => mockExporter);
    mockQueueListener = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: false,
    processNext: jest.fn().mockResolvedValue(undefined),
    handleMessage: jest.fn().mockResolvedValue(undefined),
    onMessage: jest.fn(),
    setMessageHandler: jest.fn(),
    startConsuming: jest.fn().mockResolvedValue(undefined),
    stopConsuming: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    getQueueDepth: jest.fn().mockResolvedValue(0)
    } as unknown as jest.Mocked<QueueListener>;
    (QueueListener as jest.Mock).mockImplementation(() => mockQueueListener);
    process.env.USE_ZKVM = 'false';
    service = new GlitchService();
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    jest.clearAllMocks();
    delete process.env.USE_ZKVM;
  });

  describe('start', () => {
    it('should initialize metrics and start server', async () => {
      await service.start();

      expect(metrics.getMeter).toHaveBeenCalledWith('glitch-gremlin');
      expect(mockMeter.createCounter).toHaveBeenCalledWith('glitch_requests_total');
      expect(mockMeter.createGauge).toHaveBeenCalledWith('glitch_active_tests');
      expect(mockMeter.createGauge).toHaveBeenCalledWith('glitch_queue_depth');
      expect(mockMeter.createCounter).toHaveBeenCalledWith('glitch_errors_total');
      expect(mockExporter.startServer).toHaveBeenCalled();
      expect(mockQueueListener.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting Glitch Gremlin service...');
    });

    it('should handle startup errors from metrics server', async () => {
      const error = new Error('Startup failed');
      mockExporter.startServer.mockRejectedValueOnce(error);

      await expect(service.start()).rejects.toThrow('Startup failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start service:', error);
    });

    it('should handle startup errors from queue listener', async () => {
      const error = new Error('Queue listener failed');
      mockQueueListener.start.mockRejectedValueOnce(error);

      await expect(service.start()).rejects.toThrow('Queue listener failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start service:', error);
    });
  });

  describe('stop', () => {
    it('should shutdown metrics server and queue listener gracefully', async () => {
      await service.start();
      await service.stop();

      expect(mockQueueListener.stop).toHaveBeenCalled();
      expect(mockExporter.shutdown).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Glitch Gremlin service...');
    });

    it('should handle shutdown errors from metrics server', async () => {
      const error = new Error('Shutdown failed');
      mockExporter.shutdown.mockRejectedValueOnce(error);

      await service.start();
      await expect(service.stop()).rejects.toThrow('Shutdown failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown:', error);
    });

    it('should handle shutdown errors from queue listener', async () => {
      const error = new Error('Queue listener shutdown failed');
      mockQueueListener.stop.mockRejectedValueOnce(error);

      await service.start();
      await expect(service.stop()).rejects.toThrow('Queue listener shutdown failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown:', error);
    });
  });
});
