import { Terminal } from 'lucide-react';
import ProgressMessageRotator from './ProgressMessageRotator';

const THINKING_MESSAGES = [
    "Understanding your question...",
    "Searching relevant files...",
    "Reading code context...",
    "Tracing logic flow...",
    "Comparing modules...",
    "Generating best answer...",
    "Finalizing response..."
];

export default function ThinkingIndicator({ backendProgress }) {
    return (
        <div className="flex items-start gap-2.5 justify-start message-appear">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
                <Terminal className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-slate-800/80 border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-3 relative overflow-hidden group shadow-sm">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent shimmer-animation" />
                
                <span className="text-sm text-indigo-300 italic relative z-10 min-w-[190px]">
                    {/* Only show backendProgress if it's not the generic "Thinking..." so it doesn't interrupt the nice rotator */}
                    {backendProgress && backendProgress !== "Thinking..." ? (
                        backendProgress
                    ) : (
                        <ProgressMessageRotator messages={THINKING_MESSAGES} interval={1500} />
                    )}
                </span>
                
                <div className="flex items-center gap-1.5 pt-1 relative z-10">
                    {[0, 120, 240].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: `${d}ms` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
