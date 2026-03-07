import { shouldIgnore } from '../utils/ignore.js';

/**
 * Parses a GitHub URL to extract owner and repo name.
 * e.g., https://github.com/facebook/react -> { owner: 'facebook', repo: 'react' }
 */
export function getRepoInfoFromUrl(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== 'github.com') return null;
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        return { owner: parts[0], repo: parts[1] };
    } catch {
        return null;
    }
}

/**
 * Fetches the entire repository tree recursively.
 * Uses the GitHub Trees API.
 */
export async function fetchRepoTree(owner, repo) {
    // 1. Get default branch (assuming main or master for MVP)
    // To be safe, we fetch repo info to get default branch
    let defaultBranch = 'main';
    try {
        const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (repoInfoRes.ok) {
            const repoInfo = await repoInfoRes.json();
            defaultBranch = repoInfo.default_branch;
        }
    } catch (e) {
        console.warn("Could not fetch default branch, defaulting to 'main'");
    }

    // 2. Fetch the recursive tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
    const response = await fetch(treeUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch repo tree: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.truncated) {
        console.warn('Warning: Repository tree is truncated (too large)');
    }

    return data.tree;
}

/**
 * Fetches the raw content of a specific file from GitHub.
 */
export async function fetchFileContent(owner, repo, path) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
    const response = await fetch(rawUrl);
    if (!response.ok) {
        // If HEAD fails, we might need the specific branch name
        return null;
    }
    return await response.text();
}

/**
 * Process a repository: fetch tree, filter files, fetch contents.
 * Returns an array of objects: { path, content }
 */
export async function processRepository(repoUrl) {
    const repoInfo = getRepoInfoFromUrl(repoUrl);
    if (!repoInfo) throw new Error('Invalid GitHub URL');

    const { owner, repo } = repoInfo;

    // Get all files in the repo
    console.log(`Fetching tree for ${owner}/${repo}...`);
    const tree = await fetchRepoTree(owner, repo);

    // Filter out directories and ignored files
    const filesToProcess = tree.filter(item => {
        return item.type === 'blob' && !shouldIgnore(item.path);
    });

    console.log(`Found ${filesToProcess.length} valid files to process.`);

    const downloadedFiles = [];

    // MVP approach: fetch files sequentially or in small batches to avoid rate limits
    for (const fileItem of filesToProcess) {
        console.log(`Downloading: ${fileItem.path}`);
        const content = await fetchFileContent(owner, repo, fileItem.path);
        if (content !== null) {
            downloadedFiles.push({ path: fileItem.path, content });
        }
    }

    return downloadedFiles;
}
