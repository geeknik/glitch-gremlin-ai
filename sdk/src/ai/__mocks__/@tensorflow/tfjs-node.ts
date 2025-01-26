interface LayerConfig {
    units: number;
    activation?: string;
    inputShape?: number[];
}

interface Model {
    layers: any[];
    compile: jest.Mock;
    add: jest.Mock;
    fit: jest.Mock;
    predict: jest.Mock;
    save: jest.Mock;
    dispose: jest.Mock;
    summary: jest.Mock;
    getLayer: jest.Mock;
    getWeights: jest.Mock;
    setWeights: jest.Mock;
    addWeight: jest.Mock;
    countParams: jest.Mock;
    computeOutputShape: jest.Mock;
    call: jest.Mock;
    build: jest.Mock;
    apply: jest.Mock;
    computeMask: jest.Mock;
    getInputAt: jest.Mock;
    getOutputAt: jest.Mock;
    getInputMaskAt: jest.Mock;
    getOutputMaskAt: jest.Mock;
    getInputShapeAt: jest.Mock;
    getOutputShapeAt: jest.Mock;
    setFastWeightInitDuringBuild: jest.Mock;
    resetStates: jest.Mock;
    getUpdatesFor: jest.Mock;
    getLossesFor: jest.Mock;
    initialize: jest.Mock<Promise<boolean>>;
    isInitialized: jest.Mock<boolean>;
}

interface LayersModel extends Model {
  trainable: boolean;
  inputSpec: any[];
  optimizer: any;
  metricsNames: string[];
  stopTraining: boolean;
  evaluate: jest.Mock;
  evaluateDataset: jest.Mock;
  trainOnBatch: jest.Mock;
  predictOnBatch: jest.Mock;
  predictDataset: jest.Mock;
  getLayer: jest.Mock;
  getConfig: jest.Mock;
  toJSON: jest.Mock;
  fromConfig: jest.Mock;
  getTrainableWeights: jest.Mock;
  getNonTrainableWeights: jest.Mock;
  inputNames: string[];
  outputNames: string[];
  inputs: any[];
  outputs: any[];
  trainableWeights: any[];
  nonTrainableWeights: any[];
  weights: any[];
  metrics: any[];
  metricsTensors: any[];
  optimizer_: any;
  isTraining: boolean;
  userDefinedMetadata: any;
  built: boolean;
  stateful: boolean;
  inputLayers: any[];
  outputLayers: any[];
}

const createModel = () => {
    const model = {
        trainable: true,
        inputSpec: [],
        optimizer: {},
        metricsNames: ['loss'],
        stopTraining: false,
        layers: [] as any[],
        inputNames: ['input'],
        outputNames: ['output'],
        inputs: [],
        outputs: [],
        trainableWeights: [],
        nonTrainableWeights: [],
        weights: [],
        metrics: [],
        metricsTensors: [],
        optimizer_: {},
        isTraining: false,
        userDefinedMetadata: {},
        built: true,
        stateful: false,
        inputLayers: [],
        outputLayers: [],
        
        // Model methods
        compile: jest.fn().mockImplementation((config: any) => {
            if (!config.optimizer || !config.loss) {
                throw new Error('Invalid compile configuration');
            }
            return model;
        }),
        add: jest.fn().mockImplementation((layer: any) => {
            if (!layer) {
                throw new Error('Failed to add layer');
            }
            model.layers.push(layer);
            return model;
        }),
        fit: jest.fn().mockImplementation((x, y, config) => {
            if (!x || !y) {
                throw new Error('Invalid training data');
            }
            return Promise.resolve({
                history: {
                    loss: [0.1],
                    val_loss: [0.1]
                },
                epoch: 1
            });
        }),
        predict: jest.fn().mockImplementation((inputs) => {
            if (!inputs) {
                throw new Error('Invalid prediction inputs');
            }
            return {
                dataSync: () => [0.9],
                dispose: jest.fn(),
                arraySync: () => [[0.9]],
                array: () => Promise.resolve([[0.9]])
            };
        }),
        save: jest.fn().mockImplementation((path) => {
            if (!path) {
                throw new Error('Invalid save path');
            }
            return Promise.resolve(`file://${path}/model.json`);
        }),
        dispose: jest.fn(),
        
        // Layer methods
        summary: jest.fn(),
        getLayer: jest.fn(),
        getWeights: jest.fn().mockReturnValue([]),
        setWeights: jest.fn(),
        addWeight: jest.fn(),
        countParams: jest.fn().mockReturnValue(100),
        computeOutputShape: jest.fn().mockReturnValue([1]),
        call: jest.fn().mockImplementation((inputs, kwargs) => ({
            dataSync: () => [1],
            dispose: jest.fn()
        })),
        build: jest.fn(),
        apply: jest.fn().mockImplementation((inputs, kwargs) => ({
            dataSync: () => [1],
            dispose: jest.fn()
        })),
        computeMask: jest.fn(),
        getInputAt: jest.fn(),
        getOutputAt: jest.fn(),
        getInputMaskAt: jest.fn(),
        getOutputMaskAt: jest.fn(),
        getInputShapeAt: jest.fn(),
        getOutputShapeAt: jest.fn(),
        setFastWeightInitDuringBuild: jest.fn(),
        resetStates: jest.fn(),
        getUpdatesFor: jest.fn(),
        getLossesFor: jest.fn(),
        
        // Additional model methods
        evaluate: jest.fn().mockResolvedValue([0.1]),
        evaluateDataset: jest.fn().mockResolvedValue([0.1]),
        trainOnBatch: jest.fn().mockResolvedValue(0.1),
        predictOnBatch: jest.fn().mockResolvedValue([0.9]),
        predictDataset: jest.fn().mockResolvedValue([0.9]),
        getTrainableWeights: jest.fn().mockReturnValue([]),
        getNonTrainableWeights: jest.fn().mockReturnValue([]),
        getConfig: jest.fn().mockReturnValue({}),
        toJSON: jest.fn().mockReturnValue({}),
        fromConfig: jest.fn().mockImplementation((config) => ({
            ...model,
            ...config
        })),
        initialize: jest.fn().mockResolvedValue(true),
        isInitialized: jest.fn().mockReturnValue(true)
    };
    return model;
};

const tf = {
    sequential: jest.fn().mockImplementation(() => {
        const model = createModel();
        
        // Enhanced mock layer creation
        model.add = jest.fn().mockImplementation((layerConfig) => {
            if (!layerConfig || !layerConfig.units) {
                throw new Error('Invalid layer configuration');
            }
            
            const layer = {
                units: layerConfig.units,
                activation: layerConfig.activation || 'linear',
                inputShape: layerConfig.inputShape || [null],
                getConfig: () => layerConfig,
                build: jest.fn(),
                apply: jest.fn().mockImplementation((inputs) => ({
                    dataSync: () => [0.5],
                    dispose: jest.fn()
                })),
                computeOutputShape: jest.fn().mockReturnValue([1])
            };
            
            model.layers.push(layer);
            return model;
        });

        // Enhanced mock compile
        model.compile = jest.fn().mockImplementation((config) => {
            if (!config || !config.optimizer || !config.loss) {
                throw new Error('Invalid compile configuration');
            }
            
            model.optimizer = config.optimizer;
            model.loss = config.loss;
            model.metrics = config.metrics || [];
            model.compiled = true;
            
            return model;
        });

        // Enhanced predict method
        model.predict = jest.fn().mockImplementation((inputs) => {
            if (!inputs) {
                throw new Error('Invalid prediction inputs');
            }
            return {
                dataSync: () => [0.5],
                dispose: jest.fn(),
                arraySync: () => [[0.5]],
                array: () => Promise.resolve([[0.5]])
            };
        });

        // Enhanced fit method
        model.fit = jest.fn().mockImplementation((x, y, config) => {
            if (!x || !y) {
                throw new Error('Invalid training data');
            }
            return Promise.resolve({
                history: {
                    loss: [0.1],
                    val_loss: [0.1]
                },
                epoch: 1
            });
        });

        // Add model summary
        model.summary = jest.fn().mockImplementation(() => {
            console.log('Model Summary:');
            model.layers.forEach((layer, i) => {
                console.log(`Layer ${i}: ${layer.units} units, ${layer.activation} activation`);
            });
        });

        return model;
    }),
    backend: () => ({
        dataSync: () => [1],
        dispose: jest.fn()
    }),
    getBackend: jest.fn().mockReturnValue('cpu'),
    setBackend: jest.fn(),
    memory: () => ({
        numTensors: 1,
        numDataBuffers: 1,
        numBytes: 1024
    }),
    ready: jest.fn().mockResolvedValue(true),
    nextFrame: jest.fn().mockResolvedValue(true),
    browser: {
        fromPixels: jest.fn(),
        toPixels: jest.fn()
    },
    env: () => ({
        get: jest.fn(),
        set: jest.fn(),
        getBool: jest.fn().mockReturnValue(true),
        getNumber: jest.fn().mockReturnValue(1),
        getString: jest.fn().mockReturnValue('cpu')
    }),
    train: {
        adam: jest.fn().mockReturnValue({})
    },
    layers: {
        dense: jest.fn().mockImplementation((config: LayerConfig) => ({
            units: config.units,
            activation: config.activation,
            inputShape: config.inputShape,
            apply: jest.fn().mockImplementation((inputs) => ({
                dataSync: () => [1],
                dispose: jest.fn()
            })),
            build: jest.fn(),
            getConfig: jest.fn().mockReturnValue(config),
            computeOutputShape: jest.fn().mockReturnValue([1]),
            call: jest.fn().mockImplementation((inputs) => ({
                dataSync: () => [1],
                dispose: jest.fn()
            }))
        }))
    },
    tensor1d: jest.fn().mockImplementation((values) => ({
        dataSync: () => values,
        dispose: jest.fn()
    })),
    tensor2d: jest.fn().mockImplementation((values) => ({
        dataSync: () => values,
        dispose: jest.fn()
    })),
    tidy: jest.fn().mockImplementation((fn) => fn()),
    moments: jest.fn().mockReturnValue({
        mean: 0.5,
        variance: 0.1
    }),
    sqrt: jest.fn().mockImplementation((x) => x),
    dispose: jest.fn(),
    disposeVariables: jest.fn(),
    loadLayersModel: jest.fn(() => Promise.resolve({
        layers: [],
        dispose: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn(),
        predict: jest.fn(),
        save: jest.fn()
    })),
    Sequential: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn(),
        predict: jest.fn(),
        save: jest.fn(),
        dispose: jest.fn()
    }))
};

export const node = {
  loadLayersModel: jest.fn(() => Promise.resolve({
    layers: [],
    dispose: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn(),
    predict: jest.fn(),
    save: jest.fn()
  }))
};

export const layers = {
  dense: jest.fn().mockImplementation((config: LayerConfig) => ({
    units: config.units,
    activation: config.activation,
    inputShape: config.inputShape,
    apply: jest.fn().mockImplementation((inputs) => ({
      dataSync: () => [1],
      dispose: jest.fn()
    })),
    build: jest.fn(),
    getConfig: jest.fn().mockReturnValue(config),
    computeOutputShape: jest.fn().mockReturnValue([1]),
    call: jest.fn().mockImplementation((inputs) => ({
      dataSync: () => [1],
      dispose: jest.fn()
    }))
  }))
};

export const train = {
  adam: jest.fn().mockReturnValue({})
};

export const tensor1d = jest.fn().mockImplementation((values) => ({
  dataSync: () => values,
  dispose: jest.fn()
}));

export const tensor2d = jest.fn().mockImplementation((values) => ({
  dataSync: () => values,
  dispose: jest.fn()
}));

export const tidy = jest.fn().mockImplementation((fn) => fn());
export const moments = jest.fn().mockReturnValue({
  mean: 0.5,
  variance: 0.1
});
export const sqrt = jest.fn().mockImplementation((x) => x);
export const dispose = jest.fn();
export const disposeVariables = jest.fn();

// Export sequential as both named and default export
export const sequential = tf.sequential;
export const loadLayersModel = tf.loadLayersModel;

// Ensure the default export includes all necessary properties
export default {
  ...tf,
  sequential: tf.sequential,
  loadLayersModel: tf.loadLayersModel,
  node: {
    loadLayersModel: tf.loadLayersModel
  }
};
