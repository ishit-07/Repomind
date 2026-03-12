'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import FileTreeView from '../components/FileTreeView';
import DependencyGraph from '../components/DependencyGraph';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

function StructurePageContent() {
    const searchParams = useSearchParams();
    const repoUrl = searchParams.get('repoUrl');

    const [structureData, setStructureData] = useState(null);
    const [isFetchingStructure, setIsFetchingStructure] = useState(true);
    const [selectedFileNode, setSelectedFileNode] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!repoUrl) {
            setError('No repository URL provided.');
            setIsFetchingStructure(false);
            return;
        }

        const fetchStructureData = async () => {
            setIsFetchingStructure(true);
            setError(null);
            try {
                const res = await fetch(`${BACKEND_URL}/api/structure?repoUrl=${encodeURIComponent(repoUrl)}`);
                if (!res.ok) throw new Error('Structure fetch failed');
                const data = await res.json();
                setStructureData(data);
            } catch (err) {
                console.error(err);
                setError('Failed to load repository structure. Ensure the repository has been ingested.');
            } finally {
                setIsFetchingStructure(false);
            }
        };

        fetchStructureData();
    }, [repoUrl]);

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
                <p className="text-red-400">{error}</p>
            </div>
        );
    }

    if (isFetchingStructure) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-slate-400">Loading full repository structure...</p>
            </div>
        );
    }

    if (!structureData) return null;

    return (
        <div className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
            {/* Left Sidebar: File Tree */}
            <div className="w-80 flex-shrink-0 h-full border-r border-white/10 bg-slate-900/60 shadow-2xl z-10">
                <div className="p-4 border-b border-white/10 bg-slate-900/80">
                    <h2 className="text-sm font-semibold text-slate-300">Repository Structure</h2>
                    <p className="text-xs text-slate-500 truncate mt-1">{repoUrl}</p>
                </div>
                <div className="h-[calc(100vh-65px)] overflow-y-auto">
                    <FileTreeView 
                        treeData={structureData.tree} 
                        onSelectNode={setSelectedFileNode} 
                        selectedNodeId={selectedFileNode}
                    />
                </div>
            </div>
            
            {/* Right Main: React Flow Graph */}
            <div className="flex-1 h-full relative">
                <DependencyGraph 
                    structureData={structureData} 
                    onNodeClick={setSelectedFileNode}
                />
            </div>
        </div>
    );
}

export default function StructurePage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>}>
            <StructurePageContent />
        </Suspense>
    );
}
