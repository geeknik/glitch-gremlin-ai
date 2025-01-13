import packageJson from '../package.json' assert { type: 'json' };

export function readPackageJson(): typeof packageJson {
    return packageJson;
}
