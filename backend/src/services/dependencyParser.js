import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { RepoFile } from '../models/RepoFile.js';

// traverse might default-export in commonjs vs esm
const traverse = traverseModule.default || traverseModule;

// Normalize file extension to prevent `import './foo'` missing `import './foo.js'`
function normalizePath(filePath) {
    return filePath;
}

// Check if import is a bare specifier (npm package) instead of local module
function isBareModule(importPath) {
    if (!importPath) return false;
    return !(importPath.startsWith('.') || importPath.startsWith('/'));
}

// Very basic relative path resolver.
// e.g. currentFile="src/components/Button.js", importPath="../utils/helper" -> "src/utils/helper"
// Tries to match against actual existing file paths to guess extensions
function resolveImportPath(importPath, currentFilePath, allFilePaths) {
    if (importPath.startsWith('/')) {
        importPath = importPath.slice(1);
    }
    
    let resolved = importPath;
    if (importPath.startsWith('.')) {
        const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
        const parts = currentDir ? currentDir.split('/') : [];
        const importParts = importPath.split('/');

        for (const part of importParts) {
            if (part === '.') continue;
            if (part === '..') parts.pop();
            else parts.push(part);
        }
        resolved = parts.join('/');
    }

    // Attempt to guess extensions if strictly missing
    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
    for (const ext of extensions) {
        const candidate = resolved + ext;
        if (allFilePaths.has(candidate)) {
            return candidate;
        }
    }

    // If not found in allFilePaths (e.g. dynamic/partial ingestion), return best guess
    return resolved;
}

/**
 * Extract dependencies from JS/TS content using Babel AST.
 */
function extractDependencies(content, currentFilePath) {
    const deps = new Set();
    
    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'],
            errorRecovery: true
        });

        traverse(ast, {
            ImportDeclaration(path) {
                if (path.node.source && path.node.source.value) {
                    deps.add(path.node.source.value);
                }
            },
            ExportNamedDeclaration(path) {
                if (path.node.source && path.node.source.value) {
                    deps.add(path.node.source.value);
                }
            },
            ExportAllDeclaration(path) {
                if (path.node.source && path.node.source.value) {
                    deps.add(path.node.source.value);
                }
            },
            CallExpression(path) {
                // handle require('...')
                if (path.node.callee.name === 'require' && path.node.arguments.length > 0) {
                    const arg = path.node.arguments[0];
                    if (arg.type === 'StringLiteral') {
                        deps.add(arg.value);
                    }
                }
                // handle dynamic import('...')
                if (path.node.callee.type === 'Import' && path.node.arguments.length > 0) {
                    const arg = path.node.arguments[0];
                    if (arg.type === 'StringLiteral') {
                        deps.add(arg.value);
                    }
                }
            }
        });
    } catch (e) {
        // Babel parse error (might not be JS/TS code)
        // console.warn(`Could not parse AST for ${currentFilePath}: ${e.message}`);
    }

    return Array.from(deps);
}

// DFS approach to find circular dependencies in the graph
function findCircularDependencies(nodes, edges) {
    const adjList = new Map();
    nodes.forEach(n => adjList.set(n.id, []));
    edges.forEach(e => {
        if (adjList.has(e.source)) {
            adjList.get(e.source).push(e.target);
        }
    });

    const visited = new Set();
    const recStack = new Set();
    const cycles = [];

    function dfs(nodeId, path) {
        visited.add(nodeId);
        recStack.add(nodeId);
        path.push(nodeId);

        const neighbors = adjList.get(nodeId) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor, [...path]);
            } else if (recStack.has(neighbor)) {
                // Cycle detected
                const cycleStartIdx = path.indexOf(neighbor);
                cycles.push(path.slice(cycleStartIdx).concat(neighbor));
            }
        }
        recStack.delete(nodeId);
    }

    for (const node of nodes) {
        if (!visited.has(node.id)) {
            dfs(node.id, []);
        }
    }

    return cycles;
}

// Build a nested tree structure from flat file paths for a VSCode-like file explorer
function buildFileTree(filePaths) {
    const root = { name: 'root', type: 'folder', children: [] };

    for (const filePath of filePaths) {
        const parts = filePath.split('/');
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;

            let existing = current.children.find(c => c.name === part);
            if (!existing) {
                existing = { 
                    name: part, 
                    type: isFile ? 'file' : 'folder',
                    path: parts.slice(0, i + 1).join('/')
                };
                if (!isFile) existing.children = [];
                current.children.push(existing);
            }
            current = existing;
        }
    }
    
    // Sort logic: folders first, then files alphabetically
    function sortTree(node) {
        if (node.children) {
            node.children.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            node.children.forEach(sortTree);
        }
    }
    sortTree(root);

    return root.children;
}

/**
 * Build the full dependency graph and insights for a repository.
 */
export async function buildDependencyGraph(repoUrl) {
    const files = await RepoFile.find({ repoUrl }).lean();
    
    if (!files || files.length === 0) {
        return { nodes: [], edges: [], tree: [], insights: {} };
    }

    // Limit protection for enormous repos to prevent overwhelming React Flow
    const MAX_NODES = 800;
    const processFiles = files.slice(0, MAX_NODES);
    
    const allFilePathsSet = new Set(processFiles.map(f => f.filePath));
    const nodes = [];
    const edges = [];
    const edgeSet = new Set(); // To prevent duplicate edges

    // 1. Build Nodes
    for (const file of processFiles) {
        const ext = file.filePath.split('.').pop();
        nodes.push({
            id: file.filePath,
            type: 'file',
            data: { 
                label: file.filePath.split('/').pop(),
                filePath: file.filePath,
                folder: file.filePath.split('/').slice(0, -1).join('/'),
                extension: ext
            }
        });
    }

    // 2. Build Edges using AST Parser
    for (const file of processFiles) {
        // Only parse JS/TS files
        if (!/\.(js|jsx|ts|tsx|mjs)$/.test(file.filePath)) continue;

        const rawDeps = extractDependencies(file.content, file.filePath);
        
        for (const rawDep of rawDeps) {
            if (isBareModule(rawDep)) continue; // ignore "react", "express" etc.
            
            const resolvedTarget = resolveImportPath(rawDep, file.filePath, allFilePathsSet);
            
            // Only add edge if the target file actually exists in our parsed subset
            // This drops unresolved imports and external libraries not in the DB
            if (allFilePathsSet.has(resolvedTarget)) {
                const edgeId = `${file.filePath}->${resolvedTarget}`;
                if (!edgeSet.has(edgeId)) {
                    edgeSet.add(edgeId);
                    edges.push({
                        id: edgeId,
                        source: file.filePath,
                        target: resolvedTarget,
                        animated: true,
                        style: { stroke: '#6366f1' } // indigo-500 default
                    });
                }
            }
        }
    }

    // 3. Find Circular Dependencies
    const circularDeps = findCircularDependencies(nodes, edges);
    
    // Mark circular nodes and edges directly in their data/style payload for ReactFlow
    const circularNodeIds = new Set(circularDeps.flat());
    const circularEdgeIds = new Set();
    
    for (const cycle of circularDeps) {
        for (let i = 0; i < cycle.length - 1; i++) {
            circularEdgeIds.add(`${cycle[i]}->${cycle[i+1]}`);
        }
    }

    nodes.forEach(n => {
        if (circularNodeIds.has(n.id)) {
            n.data.isCircular = true;
        }
    });

    edges.forEach(e => {
        if (circularEdgeIds.has(e.id)) {
            e.style = { stroke: '#ef4444', strokeWidth: 2 }; // red-500
            e.animated = true;
        }
    });

    // 4. Calculate Insights
    const adjacencyList = new Map();
    const reverseAdjacencyList = new Map();
    nodes.forEach(n => {
        adjacencyList.set(n.id, 0);
        reverseAdjacencyList.set(n.id, 0);
    });

    edges.forEach(e => {
        adjacencyList.set(e.source, (adjacencyList.get(e.source) || 0) + 1);
        reverseAdjacencyList.set(e.target, (reverseAdjacencyList.get(e.target) || 0) + 1);
    });

    let mostConnected = null;
    let maxConnections = -1;

    nodes.forEach(n => {
        const totalConns = (adjacencyList.get(n.id) || 0) + (reverseAdjacencyList.get(n.id) || 0);
        if (totalConns > maxConnections) {
            maxConnections = totalConns;
            mostConnected = n.id;
        }
    });

    const deadFiles = nodes
        .filter(n => (reverseAdjacencyList.get(n.id) || 0) === 0 && (adjacencyList.get(n.id) || 0) === 0)
        .map(n => n.id);

    // 5. Build File Tree
    const tree = buildFileTree(Array.from(allFilePathsSet));

    return {
        nodes,
        edges,
        tree,
        insights: {
            totalFiles: nodes.length,
            totalConnections: edges.length,
            circularDependencies: circularDeps,
            mostConnectedFile: mostConnected,
            deadFilesCount: deadFiles.length,
            isTruncated: files.length > MAX_NODES
        }
    };
}
