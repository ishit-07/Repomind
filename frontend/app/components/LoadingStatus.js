import ProgressMessageRotator from './ProgressMessageRotator';

const INGESTION_MESSAGES = [
    "Connecting to GitHub...",
    "Fetching repository files...",
    "Scanning project structure...",
    "Reading source code...",
    "Building embeddings...",
    "Mapping dependencies...",
    "Preparing AI workspace...",
    "Almost ready..."
];

export default function LoadingStatus({ ingestionProgress }) {
    // If we have actual file numbers from backend, we might show them
    const hasNumbers = ingestionProgress && ingestionProgress.total;
    
    return (
        <div className="bg-indigo-500/[0.08] border border-indigo-500/20 rounded-xl p-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/[0.05] to-transparent shimmer-animation" />
            <div className="flex justify-between items-end mb-2 relative z-10">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest min-w-[200px]">
                    <ProgressMessageRotator messages={INGESTION_MESSAGES} interval={1800} />
                </span>
                {hasNumbers && (
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900/80 px-2 py-0.5 rounded-md border border-white/5 shadow-inner">
                        {ingestionProgress.progress} / {ingestionProgress.total}
                    </span>
                )}
            </div>
            {hasNumbers ? (
                <div className="h-1.5 w-full bg-slate-900/80 rounded-full overflow-hidden relative z-10">
                    <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 ease-out rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{ width: `${Math.min(100, Math.max(5, (ingestionProgress.progress / ingestionProgress.total) * 100))}%` }}
                    />
                </div>
            ) : (
                <div className="h-1.5 w-full bg-slate-900/80 rounded-full overflow-hidden relative z-10">
                    <div className="h-full w-full bg-gradient-to-r from-indigo-500/20 via-indigo-500 to-indigo-500/20 rounded-full animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                </div>
            )}
        </div>
    );
}
