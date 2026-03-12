import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, FileJson, FileCode2, FileImage, FileText } from 'lucide-react';

// Get appropriate icon based on file extension
function getFileIcon(name) {
    if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts') || name.endsWith('.tsx')) {
        return <FileCode2 className="w-4 h-4 text-yellow-400" />;
    }
    if (name.endsWith('.json')) {
        return <FileJson className="w-4 h-4 text-green-400" />;
    }
    if (name.endsWith('.css') || name.endsWith('.scss')) {
        return <FileCode2 className="w-4 h-4 text-blue-400" />;
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) {
        return <FileImage className="w-4 h-4 text-purple-400" />;
    }
    if (name.endsWith('.md')) {
        return <FileText className="w-4 h-4 text-slate-300" />;
    }
    return <File className="w-4 h-4 text-slate-400" />;
}

function TreeNode({ node, level, onSelectNode, selectedNodeId }) {
    // Folders are expanded by default at root, collapsed deeper down
    const [isExpanded, setIsExpanded] = useState(level < 1);
    
    const isFolder = node.type === 'folder';
    const isSelected = selectedNodeId === node.path;
    
    return (
        <div className="select-none">
            <div 
                className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer transition-colors
                    ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'hover:bg-white/5 text-slate-300'}
                `}
                style={{ paddingLeft: `${ level * 12 + 8 }px` }}
                onClick={() => {
                    if (isFolder) setIsExpanded(!isExpanded);
                    if (!isFolder && onSelectNode) onSelectNode(node.path);
                }}
            >
                {isFolder ? (
                    <>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        <Folder className="w-4 h-4 text-blue-400" fill="currentColor" fillOpacity={0.2} />
                    </>
                ) : (
                    <>
                        <div className="w-3.5" /> {/* Empty space aligned with Chevron */}
                        {getFileIcon(node.name)}
                    </>
                )}
                
                <span className="text-sm truncate">{node.name}</span>
            </div>
            
            {isFolder && isExpanded && node.children && (
                <div className="flex flex-col">
                    {node.children.map((child, idx) => (
                        <TreeNode 
                            key={idx} 
                            node={child} 
                            level={level + 1} 
                            onSelectNode={onSelectNode}
                            selectedNodeId={selectedNodeId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function FileTreeView({ treeData, onSelectNode, selectedNodeId }) {
    if (!treeData || treeData.length === 0) {
        return <div className="p-4 text-sm text-slate-500">No file structure available.</div>;
    }

    return (
        <div className="h-full overflow-y-auto no-scrollbar py-2 border-l border-white/5 bg-slate-900/40">
            <div className="px-4 pb-2 mb-2 border-b border-white/5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Explorer
            </div>
            {treeData.map((node, i) => (
                <TreeNode 
                    key={i} 
                    node={node} 
                    level={0} 
                    onSelectNode={onSelectNode} 
                    selectedNodeId={selectedNodeId}
                />
            ))}
        </div>
    );
}
