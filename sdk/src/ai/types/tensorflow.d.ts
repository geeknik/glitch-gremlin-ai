import * as tf from '@tensorflow/tfjs-node';

declare module '@tensorflow/tfjs-node' {
    export interface Tensor {
        shape: number[];
        dataSync(): number[];
        dispose(): void;
        data(): Promise<number[]>;
        array(): Promise<number[][]>;
        arraySync(): number[][];
        argMax(axis: number): Tensor;
    }

    export interface Sequential extends tf.LayersModel {
        add(layer: Layer): void;
        compile(config: ModelCompileArgs): void;
        fit(x: Tensor | number[][], y: Tensor | number[][], config?: tf.ModelFitArgs): Promise<tf.History>;
        predict(x: Tensor): Tensor;
        save(path: string): Promise<void>;
        dispose(): void;
        getWeights(): Tensor[];
        setWeights(weights: Tensor[]): void;
        trainOnBatch(x: Tensor, y: Tensor): Promise<number>;
        layers: Layer[];
    }

    export interface Layer {
        apply(inputs: Tensor): Tensor;
        getClassName(): string;
        getConfig(): any;
    }

    export interface ModelCompileArgs {
        optimizer: string | tf.Optimizer;
        loss: string | tf.LossOrMetricFn;
        metrics?: string[] | tf.LossOrMetricFn[];
    }

    export const layers: {
        dense: (config: any) => Layer;
        dropout: (config: any) => Layer;
    };

    export const train: {
        adam: (learningRate?: number) => tf.Optimizer;
    };

    export const tensor: (values: number[], shape?: number[]) => Tensor;
    export const tensor1d: (values: number[], dtype?: tf.DataType) => Tensor;
    export const tensor2d: (values: number[][], shape?: [number, number], dtype?: tf.DataType) => Tensor;
    export const concat: (tensors: Tensor[], axis?: number) => Tensor;
    export const oneHot: (indices: Tensor, depth: number) => Tensor;
    export const sequential: (config?: { layers: Layer[] }) => Sequential;
    export const loadLayersModel: (path: string) => Promise<Sequential>;
    export const randomNormal: (shape: number[], mean?: number, stdDev?: number, dtype?: tf.DataType) => Tensor;
    export const util: {
        assert(condition: boolean, message: string): void;
    };
    export const node: {
        summaryFileWriter: (logDir: string) => any;
    };
    export const dispose: (tensors: Tensor[]) => void;
    export const disposeVariables: () => void;
}
