import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';

/**
 * Custom Jest resolver to handle ESM imports
 */
export const sync = function(request, options) {
    // Special handling for @solana/web3.js and other packages
    const specialPackages = ['@solana/web3.js', '@noble/hashes', '@noble/curves'];
    if (specialPackages.includes(request)) {
        return options.defaultResolver(request, {
            ...options,
            packageFilter: pkg => {
                pkg.main = pkg.main || 'lib/index.cjs'; // Fallback to CJS if available
                return pkg;
            },
            conditions: ['node-addons', 'require', 'node']
        });
    }

    return options.defaultResolver(request, {
        ...options,
        packageFilter: pkg => {
            if (pkg.type === 'module') {
                pkg.main = pkg.module || pkg.main;
            } else if (pkg.module && !pkg.main) {
                pkg.main = pkg.module;
            }
            return pkg;
        },
        conditions: ['require', 'node', 'import']
    });
};

export const async = function(request, options) {
    // Special handling for @solana/web3.js and other packages
    const specialPackages = ['@solana/web3.js', '@noble/hashes', '@noble/curves'];
    if (specialPackages.includes(request)) {
        return options.defaultResolver(request, {
            ...options,
            packageFilter: pkg => {
                pkg.main = pkg.main || 'lib/index.cjs'; // Fallback to CJS if available
                return pkg;
            },
            conditions: ['node-addons', 'require', 'node']
        });
    }

    return options.defaultResolver(request, {
        ...options,
        packageFilter: pkg => {
            if (pkg.type === 'module') {
                pkg.main = pkg.module || pkg.main;
            } else if (pkg.module && !pkg.main) {
                pkg.main = pkg.module;
            }
            return pkg;
        },
        conditions: ['require', 'node', 'import']
    });
};
