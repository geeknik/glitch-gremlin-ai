import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';

export interface TimeSeriesMetric {
    timestamp: number;
    metrics: {
        [key: string]: number[];
    };
    metadata?: {
        [key: string]: any;
    };
}

export interface ModelConfig {
    inputSize: number;
    featureSize: number;
    timeSteps: number;
    encoderLayers: number[];
    decoderLayers: number[];
    lstmUnits: number;
    dropoutRate: number;
    batchSize: number;
    epochs: number;
    learningRate: number;
    validationSplit: number;
    anomalyThreshold: number;
    sensitivityLevel: number;
    adaptiveThresholding: boolean;
    featureEngineering: {
        enableTrending: boolean;
        enableSeasonality: boolean;
        enableCrossCorrelation: boolean;
        windowSize: number;
    };
    enableGPU: boolean;
    tensorflowMemoryOptimization: boolean;
    cacheSize: number;
}

export interface AnomalyResult {
    isAnomaly: boolean;
    confidence: number;
    details: AnomalyDetails;
    insights: AnomalyInsights;
    metrics: PerformanceMetrics;
}

export interface AnomalyDetails {
    anomalousMetrics: string[];
    contributingFactors: {
        metric: string;
        importance: number;
        threshold: number;
        currentValue: number;
    }[];
    patterns: {
        type: string;
        confidence: number;
        description: string;
    }[];
}

export interface AnomalyInsights {
    rootCause: {
        probability: number;
        factors: string[];
        evidence: string[];
    };
    recommendations: {
        priority: 'high' | 'medium' | 'low';
        action: string;
        impact: string;
    }[];
    historicalContext: {
        similarIncidents: number;
        frequency: string;
        lastOccurrence: Date | null;
    };
}

export interface PerformanceMetrics {
    processingTime: number;
    memoryUsage: number;
    modelAccuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
}

export interface AnomalyDetailsItem {
type: string;
score: number;
threshold: number;
correlatedPatterns?: string[];
}

export interface ModelConfig {
inputSize: number;
hiddenLayers?: number[];
learningRate: number;
epochs: number;
anomalyThreshold: number;
}

export class AnomalyDetector extends EventEmitter {
    private models: {
        autoencoder: tf.LayersModel;
        lstm: tf.LayersModel;
    };
    private readonly config: ModelConfig;
    private readonly featureExtractor: FeatureExtractor;
    private readonly statisticalAnalyzer: StatisticalAnalyzer;
    private readonly performanceMonitor: PerformanceMonitor;
    private readonly metrics = [
        'instructionFrequency', 'executionTime', 'memoryUsage', 'cpuUtilization',
        'errorRate', 'pdaValidation', 'accountDataMatching', 'cpiSafety', 'authorityChecks'
    ] as const;
    private isInitialized = false;

    constructor(config: Partial<ModelConfig>) {
        super();
        this.config = {
            inputSize: 40,
            featureSize: 32,
            timeSteps: 100,
            encoderLayers: [64, 32],
            decoderLayers: [32, 64],
            lstmUnits: 128,
            dropoutRate: 0.2,
            batchSize: 32,
            epochs: 100,
            learningRate: 0.001,
            validationSplit: 0.2,
            anomalyThreshold: 0.95,
            sensitivityLevel: 0.8,
            adaptiveThresholding: true,
            featureEngineering: {
                enableTrending: true,
                enableSeasonality: true,
                enableCrossCorrelation: true,
                windowSize: 50,
            },
            enableGPU: true,
            tensorflowMemoryOptimization: true,
            cacheSize: 1000,
            ...config
        };
        this.validateConfig();
        this.initializeComponents();
    }

    private validateConfig(): void {
    if (this.config.inputSize <= 0) {
        throw new Error('Input size must be a positive number');
    }
    if (this.config.epochs <= 0) {
        throw new Error('Epochs must be a positive number');
    }
    if (this.config.anomalyThreshold < 0 || this.config.anomalyThreshold > 1) {
        throw new Error('Anomaly threshold must be between 0 and 1');
    }
    }
    }

private initializeComponents(): void {
    this.featureExtractor = new FeatureExtractor(this.config.featureEngineering);
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.performanceMonitor = new PerformanceMonitor();
    this.buildModels();
}

private buildModels(): void {
    tf.tidy(() => {
        // Build autoencoder model
        const autoencoder = this.buildAutoencoder();
        autoencoder.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });
        this.models.autoencoder = autoencoder;

        // Build LSTM model
        const lstm = this.buildLSTM();
        lstm.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });
        this.models.lstm = lstm;
    });
}
    // Hidden layers
    for (let i = 1; i < this.config.hiddenLayers.length; i++) {
    model.add(tf.layers.dense({
        units: this.config.hiddenLayers[i],
        activation: 'relu'
    }));
    }

    // Output layer (reconstruction)
    model.add(tf.layers.dense({
    units: this.config.inputDimensions,
    activation: 'sigmoid'
    }));

    model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError'
    });

    this.model = model;
    this.isInitialized = true;
}

private preprocessMetrics(metrics: TimeSeriesMetric[]): tf.Tensor2D {
    return tf.tidy((): tf.Tensor2D => {
        const flattenedData = metrics.map(metric => [
        ...metric.instructionFrequency,
        ...metric.executionTime,
        ...metric.memoryUsage,
        ...metric.cpuUtilization,
        ...metric.errorRate,
        ...metric.pdaValidation,
        ...metric.accountDataMatching,
        ...metric.cpiSafety,
        ...metric.authorityChecks
        ]);

        const tensorData = tf.tensor2d(flattenedData);
        
        if (!this.meanStd) {
            const moments = tf.moments(tensorData, 0);
            this.meanStd = {
                mean: Array.from(moments.mean.dataSync()),
                std: Array.from(tf.sqrt(moments.variance).dataSync())
            };
            tf.dispose([moments.mean, moments.variance]);
        }

    const normalizedData = tensorData.sub(tf.tensor2d([this.meanStd.mean]))
    .div(tf.tensor2d([this.meanStd.std]));

    return normalizedData as tf.Tensor2D; // Explicit cast
}

public async train(metrics: TimeSeriesMetric[]): Promise<void> {
this.validateTrainingData(metrics);

const processedData = this.preprocessMetrics(metrics);
this.model = this.buildModel();

this.model.compile({
    optimizer: tf.train.adam(this.config.learningRate),
    loss: 'meanSquaredError'
});

const tensorData = tf.tensor2d(processedData);

try {
    await this.model.fit(tensorData, tensorData, {
    epochs: this.config.epochs,
    callbacks: {
        onEpochEnd: (epoch, logs) => {
        this.emit('trainingProgress', { epoch, logs });
        }
    }
    });
} catch (error) {
    this.emit('trainingError', error);
    throw error;
}
}

private validateTrainingData(metrics: TimeSeriesMetric[]): void {
if (!metrics || metrics.length < 10) {
    throw new Error('Insufficient training data: At least 10 data points required');
}

const validMetrics = Object.keys(metrics[0])
    .filter(key => key !== 'timestamp')
    .filter(key => Array.isArray(metrics[0][key]));

if (validMetrics.length === 0) {
    throw new Error('No valid metrics found for training');
}
}

    if (!this.isInitialized) {
    await this.buildModel();
    }

    const tensorData = this.preprocessMetrics(metrics);

    const trainCallback = {
    onEpochEnd: (epoch: number, logs?: tf.Logs) => {
        this.emit('trainingProgress', {
        epoch,
        totalEpochs: this.config.epochs,
        loss: logs?.loss?.toFixed(4)
        });
    }
    };

    await this.model.fit(tensorData, tensorData, {
    epochs: this.config.epochs,
    batchSize: this.config.batchSize,
    validationSplit: this.config.validationSplit,
    callbacks: trainCallback
    });

    // Calculate reconstruction error thresholds
    const predictions = this.model.predict(tensorData) as tf.Tensor;
    const reconstructionErrors = tf.sub(tensorData, predictions).abs().mean(1);
    const errorsArray = reconstructionErrors.arraySync() as number[];
    const sorted = errorsArray.sort((a: number, b: number) => a - b);
    const index = Math.floor(sorted.length * this.config.anomalyThreshold);
    const threshold = sorted[index]; // Manual quantile calculation
    
    this.thresholds = {
    reconstruction: threshold
    };
}

public async detect(metrics: TimeSeriesMetric[]): Promise<{ 
isAnomaly: boolean, 
confidence: number, 
details: string[] 
}> {
if (!this.model) {
    throw new Error('Model not trained');
}

const processedData = this.preprocessMetrics(metrics);
const tensorData = tf.tensor2d(processedData);

const prediction = this.model.predict(tensorData) as tf.Tensor;
const reconstructionError = tf.mean(tf.abs(tf.sub(tensorData, prediction))).dataSync()[0];

const isAnomaly = reconstructionError > this.config.anomalyThreshold;
const confidence = reconstructionError;

const details = this.analyzeAnomalyDetails(metrics, reconstructionError);

return { isAnomaly, confidence, details };
}

private analyzeAnomalyDetails(metrics: TimeSeriesMetric[], error: number): string[] {
const details: string[] = [];
const errorThreshold = this.config.anomalyThreshold;

Object.keys(metrics[0])
    .filter(key => key !== 'timestamp')
    .forEach(metric => {
    const metricValues = metrics.map(m => m[metric]);
    const meanValue = this.calculateMean(metricValues as number[]);
    const variance = this.calculateVariance(metricValues as number[]);
    
    if (variance > errorThreshold) {
        details.push(`High variance in ${metric}: possible anomaly source`);
    }
    });

return details;
}

private calculateMean(values: number[]): number {
return values.reduce((a, b) => a + b, 0) / values.length;
}

private calculateVariance(values: number[]): number {
const mean = this.calculateMean(values);
const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
return this.calculateMean(squaredDiffs);
}

    public async detect(metrics: TimeSeriesMetric[]): Promise<AnomalyResult> {
        if (!this.isInitialized) {
            throw new Error('Model not trained');
        }

        const tensorData = this.preprocessMetrics(metrics);
        const predictions = this.models.autoencoder.predict(tensorData) as tf.Tensor;
        const reconstructionErrors = tf.sub(predictions, tensorData).abs().mean(1);
        
        const anomalyScores = reconstructionErrors.div(tf.scalar(this.config.anomalyThreshold));
        const isAnomaly = anomalyScores.greater(tf.scalar(1));

        const details: AnomalyDetailsItem[] = [];
        for (let i = 0; i < this.metrics.length; i++) {
            const metricScore = anomalyScores.slice([0, i * 4], [-1, 4]).mean();
            const score = metricScore.dataSync()[0];
            
            if (score > 0.8) {
                details.push({
                    type: this.metrics[i],
                    score,
                    threshold: this.config.anomalyThreshold,
                    correlatedPatterns: this.findCorrelatedPatterns(this.metrics[i], metrics)
                });
            }
        }

        return {
            isAnomaly: isAnomaly.any().dataSync()[0] === 1,
            confidence: anomalyScores.mean().dataSync()[0],
            details,
            timestamp: Date.now()
        };
    }

    public async cleanup(): Promise<void> {
        if (this.models) {
            if (this.models.autoencoder) {
                this.models.autoencoder.dispose();
            }
            if (this.models.lstm) {
                this.models.lstm.dispose();
            }
        }
        this.isInitialized = false;
    }
}

private findCorrelatedPatterns(metricType: string, metrics: TimeSeriesMetric[]): string[] {
    const correlatedPatterns: string[] = [];
    const thresholds = {
    instructionFrequency: 0.8,
    executionTime: 0.8,
    memoryUsage: 0.7,
    cpuUtilization: 0.75,
    errorRate: 0.9,
    pdaValidation: 0.85,
    accountDataMatching: 0.85,
    cpiSafety: 0.9,
    authorityChecks: 0.95
};

// Analyze correlations between metrics
type MetricKey = keyof typeof thresholds;
Object.keys(thresholds).forEach((metric) => {
    if (metric !== metricType && this.isMetricCorrelated(metrics, metricType as MetricKey, metric as MetricKey)) {
    correlatedPatterns.push(metric);
    }
});

return correlatedPatterns;
}

private isMetricCorrelated(metrics: TimeSeriesMetric[], metric1: keyof TimeSeriesMetric, metric2: keyof TimeSeriesMetric): boolean {
    if (!metrics.length) {
        return false;
    }

const values1 = metrics.map(m => (m[metric1] as number[]).reduce((a, b) => a + b, 0) / (m[metric1] as number[]).length);
const values2 = metrics.map(m => (m[metric2] as number[]).reduce((a, b) => a + b, 0) / (m[metric2] as number[]).length);

const correlation = this.calculateCorrelation(values1, values2);
return Math.abs(correlation) > 0.7;
}

private calculateCorrelation(x: number[], y: number[]): number {
const n = x.length;
const sum1 = x.reduce((a, b) => a + b, 0);
const sum2 = y.reduce((a, b) => a + b, 0);
const sum1Sq = x.reduce((a, b) => a + b * b, 0);
const sum2Sq = y.reduce((a, b) => a + b * b, 0);
const pSum = x.map((x, i) => x * y[i]).reduce((a, b) => a + b, 0);

const num = pSum - (sum1 * sum2 / n);
const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

return den === 0 ? 0 : num / den;
}

public async save(modelPath: string): Promise<void> {
    if (!this.isInitialized) {
    throw new Error('Model not trained');
}

    if (!modelPath) {
    throw new Error('Invalid save path specified');
    }

    await fs.promises.mkdir(modelPath, { recursive: true });
    
    // Save model architecture and weights
    await this.model.save(`file://${modelPath}`);
    
    // Save normalization parameters and thresholds
    await fs.promises.writeFile(
    path.join(modelPath, 'metadata.json'),
    JSON.stringify({
        meanStd: this.meanStd,
        thresholds: this.thresholds,
        config: this.config
    })
    );
}

async load(modelPath: string): Promise<void> {
    if (!fs.existsSync(modelPath)) {
    throw new Error('Model file not found');
    }

    try {
    // Load model architecture and weights
    this.model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
    
    // Load metadata
    const metadata = JSON.parse(
        await fs.promises.readFile(path.join(modelPath, 'metadata.json'), 'utf8')
    );
    
    this.meanStd = metadata.meanStd;
    this.thresholds = metadata.thresholds;
    Object.assign(this.config, metadata.config); // Update config properties
    
    this.isInitialized = true;
    } catch (error) {
    throw new Error('Invalid model format');
    }
}

async cleanup(): Promise<void> {
    if (this.model) {
    this.model.dispose();
    }
    this.isInitialized = false;
    this.meanStd = null;
    this.thresholds = {};
}
}

