/** @type {import('jest').Config} */
export default {
    // ... (rest of your config)

    // Add this configuration
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // Transform configuration
    transform: {
        '^.+\\.[jt]sx?$': ['@swc/jest'] // Transform all js/ts files
    },
    moduleNameMapper: {
        // ... other mappings
        "text-encoding-utf-8": "<rootDir>/src/__mocks__/text-encoding-utf-8.ts" // Add this line
    },

    // ... (rest of your config)
};
