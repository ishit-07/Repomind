// Standard list of files/folders to ignore when scraping repositories
export const IGNORE_LIST = [
    'node_modules',
    '.git',
    '.next',
    'build',
    'dist',
    'out',
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    '.DS_Store',
    // Common binary/asset extensions
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip', '.tar.gz', '.mp3', '.mp4', '.ttf', '.woff', '.woff2'
];

/**
 * Check if a file path should be ignored.
 * @param {string} filePath - the path of the file/folder
 * @returns {boolean}
 */
export function shouldIgnore(filePath) {
    for (const ignoreItem of IGNORE_LIST) {
        // Check if the path contains the ignored item as a distinct segment or matches extension
        if (filePath.includes(`/${ignoreItem}/`) || filePath.startsWith(`${ignoreItem}/`) || filePath === ignoreItem || filePath.endsWith(ignoreItem)) {
            return true;
        }
    }
    return false;
}
