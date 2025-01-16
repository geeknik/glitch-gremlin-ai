import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';

/**
 * Custom Jest resolver to handle ESM imports
 */
export default {
    sync: function(request, options) {
        return options.defaultResolver(request, {
            ...options,
            packageFilter: pkg => {
                if (pkg.type === 'module') {
                    pkg.main = pkg.module || pkg.main;
                }
                return pkg;
            },
        });
    },
    async: function(request, options) {
        return options.defaultResolver(request, {
            ...options,
            packageFilter: pkg => {
                if (pkg.type === 'module') {
                    pkg.main = pkg.module || pkg.main;
                }
                return pkg;
            },
        });
    }
};
