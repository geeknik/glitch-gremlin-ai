declare global {
    namespace NodeJS {
        interface Global {
            security?: {
                mutation?: {
                    test: (config: any) => Promise<any>;
                };
            };
        }
    }
}

// Explicitly declare the global security interface
interface GlobalSecurity {
    mutation?: {
        test: (config: any) => Promise<any>;
    };
}

declare const global: typeof globalThis & {
    security?: GlobalSecurity;
};
