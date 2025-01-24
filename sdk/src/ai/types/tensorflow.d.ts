declare module '@tensorflow/tfjs-node' {
    export interface Tensor {
        data(): Promise<Float32Array>;
        dispose(): void;
    }

    export interface LayersModel {
        predict(input: Tensor): Tensor;
    }

    export interface Sequential {
        add(layer: any): Sequential;
        compile(config: any): Sequential;
        fit(input: Tensor, output: Tensor, config: any): Promise<{history: any, epoch: number}>;
        predict(input: Tensor): Tensor;
        layers: {
            dense: (config: any) => any;
        };
    }

    export const sequential: () => Sequential;
    export const tensor: (values: number[], shape: number[]) => Tensor;
    export const layers: {
        dense: (config: any) => any;
    };
    export const train: {
        adam: (learningRate: number) => any;
    };
}
