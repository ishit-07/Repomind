import React, { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    Panel,
    MarkerType,
    useReactFlow,
    ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { FileCode2, FileJson, FileImage, FileText, AlertTriangle, X, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 220;
const nodeHeight = 50;

function getLayoutedElements(nodes, edges, direction = 'TB') {
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const newNode = { ...node };

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        newNode.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };

        return newNode;
    });

    return { nodes: newNodes, edges };
}

// Custom Node Component to render file cards
const FileNode = ({ data }) => {
    let Icon = FileText;
    let iconColor = 'text-slate-400';
    let borderColor = 'border-slate-700';

    if (data.extension === 'js' || data.extension === 'ts' || data.extension === 'jsx' || data.extension === 'tsx') {
        Icon = FileCode2;
        iconColor = 'text-yellow-400';
        borderColor = 'border-yellow-900/50';
    } else if (data.extension === 'json') {
        Icon = FileJson;
        iconColor = 'text-green-400';
        borderColor = 'border-green-900/50';
    }

    return (
        <div className={`px-3 py-2 shadow-lg rounded-xl bg-slate-900 border ${data.isCircular ? 'border-red-500 shadow-red-900/20' : borderColor} flex items-center gap-2 min-w-[200px] max-w-[250px]`}>
            <Icon className={`w-5 h-5 flex-shrink-0 ${data.isCircular ? 'text-red-500' : iconColor}`} />
            <div className="flex flex-col min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate" title={data.label}>{data.label}</div>
                <div className="text-[9px] text-slate-500 truncate" title={data.folder}>{data.folder || '/'}</div>
            </div>
            {data.isCircular && <AlertTriangle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />}
        </div>
    );
};

const nodeTypes = { file: FileNode };

function DependencyGraphInner({ structureData, onNodeClick }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();

    // File Preview State
    const [selectedNodeData, setSelectedNodeData] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    useEffect(() => {
        if (!structureData || !structureData.nodes || structureData.nodes.length === 0) return;

        // Apply dagre layout mechanism
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            structureData.nodes,
            structureData.edges,
            'LR' // Left to Right flow usually looks better for dependencies
        );

        // Format edges with markers
        const formattedEdges = layoutedEdges.map(e => ({
            ...e,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 15,
                height: 15,
                color: e.style?.stroke || '#6366f1',
            },
        }));

        setNodes(layoutedNodes);
        setEdges(formattedEdges);

        // Defer fitView briefly so ReactFlow can render first
        window.setTimeout(() => {
            fitView({ padding: 0.2, duration: 800 });
        }, 50);
    }, [structureData, setNodes, setEdges, fitView]);

    const handleNodeClick = useCallback(async (event, node) => {
        if (onNodeClick) onNodeClick(node.id);
        
        setSelectedNodeData(node.data);

        // Impact Analysis: Highlight incoming/outgoing edges, dim others
        setNodes(nds => nds.map(n => ({
            ...n,
            style: { ...n.style, opacity: (n.id === node.id) ? 1 : 0.4 }
        })));

        setEdges(eds => eds.map(e => {
            const isConnected = e.source === node.id || e.target === node.id;
            const isCircular = e.style?.stroke === '#ef4444';
            return {
                ...e,
                animated: isConnected || isCircular,
                style: {
                    ...e.style,
                    opacity: isConnected ? 1 : 0.1,
                    strokeWidth: isConnected ? 2 : (isCircular ? 2 : 1)
                }
            };
        }));

        // Fetch File Content
        if (structureData?.repoUrl && node.id) {
            setIsPreviewLoading(true);
            try {
                const res = await fetch(`${BACKEND_URL}/api/file?repoUrl=${encodeURIComponent(structureData.repoUrl)}&filePath=${encodeURIComponent(node.id)}`);
                if (res.ok) {
                    const data = await res.json();
                    setFilePreview(data.content);
                } else {
                    setFilePreview('// File content unavailable...');
                }
            } catch (err) {
                setFilePreview('// Failed to fetch file content.');
            } finally {
                setIsPreviewLoading(false);
            }
        }
    }, [onNodeClick, setNodes, setEdges, structureData]);

    const handlePaneClick = useCallback(() => {
        if (onNodeClick) onNodeClick(null);
        setSelectedNodeData(null);
        setFilePreview(null);
        
        // Reset opacities on background click, preserving original circular edge styles
        setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
        setEdges(eds => eds.map(e => {
            const isCircular = e.style?.stroke === '#ef4444';
            return {
                ...e,
                animated: isCircular || true, // default animated: true for all in backend
                style: {
                    ...e.style,
                    opacity: 1,
                    strokeWidth: isCircular ? 2 : 1
                }
            };
        }));
    }, [onNodeClick, setNodes, setEdges]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-950"
            minZoom={0.1}
        >
            <Background color="#334155" gap={24} size={2} />
            <Controls className="fill-slate-400 bg-slate-900 border-slate-800" />
            <MiniMap 
                nodeColor={n => n.data?.isCircular ? '#ef4444' : '#6366f1'} 
                maskColor="rgba(15, 23, 42, 0.7)" 
                className="bg-slate-900 border-slate-800" 
            />
            
            <Panel position="top-right" className={`bg-slate-900/80 backdrop-blur border border-white/10 p-3 rounded-xl m-4 transition-all duration-300 ${selectedNodeData ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <div className="text-xs font-medium text-slate-300 mb-2">Graph Legend</div>
                <div className="flex flex-col gap-1.5 text-[10px] text-slate-400">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div> JS/TS Files</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-400 rounded-sm"></div> JSON Files</div>
                    <div className="flex items-center gap-2 mt-1"><div className="w-3 h-0.5 bg-indigo-500"></div> Imports/Depends On</div>
                    <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-3 h-3" /> Circular Dependency</div>
                    <div className="mt-2 text-indigo-300 opacity-80 italic">Click a node to view impact</div>
                </div>
            </Panel>

            {/* File Preview Side Panel */}
            <div className={`absolute top-0 right-0 h-full w-full max-w-sm bg-slate-900 border-l border-white/10 shadow-2xl transition-transform duration-300 transform ${selectedNodeData ? 'translate-x-0' : 'translate-x-full'} flex flex-col z-20`}>
                {selectedNodeData && (
                    <>
                        {/* Header */}
                        <div className="flex items-center z-30 justify-between px-4 py-3 border-b border-white/10 bg-slate-900/95">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedNodeData.isCircular ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                    <FileCode2 className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-white truncate">{selectedNodeData.label}</h3>
                                    <p className="text-[10px] text-slate-400 truncate">{selectedNodeData.folder || '/'}</p>
                                </div>
                            </div>
                            <button
                                onClick={handlePaneClick}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex-shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        {/* Circular Warning */}
                        {selectedNodeData.isCircular && (
                            <div className="px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 flex flex-shrink-0 items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-300 leading-relaxed">This file is part of a <strong>circular dependency loop</strong>. Consider refactoring to break the cycle.</p>
                            </div>
                        )}

                        {/* File Content Workspace */}
                        <div className="flex-1 overflow-auto bg-[#0d1117] relative">
                            {isPreviewLoading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                                    <p className="text-xs text-slate-500 font-mono">Fetching source...</p>
                                </div>
                            ) : (
                                <pre className="text-[11px] font-mono leading-relaxed text-slate-300 p-4">
                                    <code>{filePreview}</code>
                                </pre>
                            )}
                        </div>
                    </>
                )}
            </div>
        </ReactFlow>
    );
}

// Wrap with Provider required for hooks like useReactFlow
export default function DependencyGraph(props) {
    return (
        <ReactFlowProvider>
            <div className="w-full h-full relative" style={{ minHeight: '500px' }}>
                <DependencyGraphInner {...props} />
            </div>
        </ReactFlowProvider>
    );
}
