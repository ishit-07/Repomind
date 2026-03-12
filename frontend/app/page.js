"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Github, Loader2, GitBranch, Terminal, Sparkles, RotateCcw, MessageSquare, Network, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DependencyGraph from './components/DependencyGraph';
import FileTreeView from './components/FileTreeView';
import MermaidDiagram from './components/MermaidDiagram';

const BACKEND_URL = 'http://localhost:5000';



function StreamingCursor() {
    return <span className="streaming-cursor" aria-hidden="true" />;
}

// Suggestion chip icons — rotate through a small set
const CHIP_ICONS = ['🔍', '⚙️', '📦', '🧩'];

export default function Home() {
    const [repoUrl, setRepoUrl] = useState('');
    const [isIngesting, setIsIngesting] = useState(false);
    const [ingestionComplete, setIngestionComplete] = useState(false);
    const [ingestionData, setIngestionData] = useState(null);

    const [question, setQuestion] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [messages, setMessages] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

    // Structure View State
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'structure'
    const [structureData, setStructureData] = useState(null);
    const [isFetchingStructure, setIsFetchingStructure] = useState(false);
    const [selectedFileNode, setSelectedFileNode] = useState(null);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // ── Helper: stream a text via SSE into the last message slot ────────────────
    const streamTextIntoLastMessage = useCallback(async (fetchFn) => {
        const res = await fetchFn();
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Request failed');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') break;
                try {
                    const parsed = JSON.parse(payload);
                    if (parsed.error) throw new Error(parsed.error);
                    if (parsed.token) {
                        fullText += parsed.token;
                        setMessages(prev => {
                            const copy = [...prev];
                            copy[copy.length - 1] = { role: 'assistant', content: fullText, streaming: true };
                            return copy;
                        });
                    }
                } catch (_) { }
            }
        }

        // Mark done
        setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: fullText, streaming: false };
            return copy;
        });

        return fullText;
    }, []);

    // ── Ingestion + Summary ────────────────────────────────────────────────────
    const handleIngest = async (e) => {
        e.preventDefault();
        if (!repoUrl) return;

        setIsIngesting(true);
        setIngestionComplete(false);
        setIngestionData(null);
        setMessages([]);
        setSuggestions([]);

        try {
            // Step 1: Ingest
            const res = await fetch(`${BACKEND_URL}/api/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ingestion failed');

            setIngestionData(data);
            setIngestionComplete(true);

            // Step 2: Stream summary as first AI message
            setMessages([{ role: 'assistant', content: '', streaming: true }]);
            setIsStreaming(true);

            try {
                await streamTextIntoLastMessage(() =>
                    fetch(`${BACKEND_URL}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            repoUrl,
                            question: 'Give me a concise summary of this repository: what it does, the tech stack, and the key modules or features.',
                            history: [],
                        }),
                    })
                );
            } catch (_) {
                // Fallback if summary fails
                setMessages([{
                    role: 'assistant',
                    content: `Repository **${repoUrl.split('/').slice(-1)[0]}** ingested successfully — ${data.filesProcessed} files, ${data.chunksCreated} embeddings. Ask me anything about the code!`,
                    streaming: false,
                }]);
            } finally {
                setIsStreaming(false);
            }

            // Step 3: Fetch suggestions and structure in background
            fetchSuggestions(repoUrl);
            fetchStructureData(repoUrl);
        } catch (err) {
            setMessages([{ role: 'assistant', content: `**Error:** ${err.message}`, streaming: false }]);
            setIngestionComplete(true);
        } finally {
            setIsIngesting(false);
        }
    };

    // ── Suggestions ───────────────────────────────────────────────────────────
    const fetchSuggestions = async (url) => {
        setIsFetchingSuggestions(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/suggestions?repoUrl=${encodeURIComponent(url)}`);
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch (_) {
            setSuggestions([]);
        } finally {
            setIsFetchingSuggestions(false);
        }
    };

    // ── Structure Data ─────────────────────────────────────────────────────────
    const fetchStructureData = async (url) => {
        setIsFetchingStructure(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/structure?repoUrl=${encodeURIComponent(url)}`);
            if (!res.ok) throw new Error('Structure fetch failed');
            const data = await res.json();
            setStructureData(data);
        } catch (_) {
            setStructureData(null);
        } finally {
            setIsFetchingStructure(false);
        }
    };

    // ── Streaming Chat ─────────────────────────────────────────────────────────
    const sendMessage = useCallback(async (text) => {
        if (!text.trim() || !ingestionComplete || isStreaming) return;

        const history = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setQuestion('');
        setSuggestions([]);
        setIsStreaming(true);
        setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

        try {
            await streamTextIntoLastMessage(() =>
                fetch(`${BACKEND_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repoUrl, question: text, history }),
                })
            );
        } catch (err) {
            setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: `**Error:** ${err.message}`, streaming: false };
                return copy;
            });
        } finally {
            setIsStreaming(false);
            inputRef.current?.focus();
        }
    }, [repoUrl, messages, ingestionComplete, isStreaming, streamTextIntoLastMessage]);

    const handleChat = (e) => { e.preventDefault(); sendMessage(question); };
    const handleReset = () => {
        setIngestionComplete(false);
        setIngestionData(null);
        setMessages([]);
        setSuggestions([]);
        setRepoUrl('');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
            <style>{`
                .code-block {
                    background: #080c18;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 10px;
                    padding: 14px 16px;
                    margin: 10px 0;
                    overflow-x: auto;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 0.76rem;
                    line-height: 1.65;
                    color: #a5b4fc;
                    white-space: pre;
                }
                .inline-code {
                    background: rgba(99,102,241,0.15);
                    color: #a5b4fc;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 0.82em;
                }
                .streaming-cursor {
                    display: inline-block;
                    width: 2px;
                    height: 1em;
                    background: #818cf8;
                    margin-left: 2px;
                    vertical-align: middle;
                    animation: blink 0.9s step-end infinite;
                    border-radius: 1px;
                }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
                .message-appear { animation: msgIn 0.2s ease-out; }
                @keyframes msgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
                .suggestion-card {
                    position: relative;
                    background: rgba(15,18,36,0.8);
                    border: 1px solid rgba(99,102,241,0.18);
                    border-radius: 14px;
                    padding: 12px 14px;
                    cursor: pointer;
                    transition: border-color 0.18s, background 0.18s, transform 0.15s, box-shadow 0.18s;
                    text-align: left;
                    overflow: hidden;
                }
                .suggestion-card:hover {
                    border-color: rgba(99,102,241,0.5);
                    background: rgba(99,102,241,0.08);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(99,102,241,0.12);
                }
                .suggestion-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 60%);
                    border-radius: inherit;
                    pointer-events: none;
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Header */}
            <header className="border-b border-white/[0.06] bg-slate-900/60 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 w-8 h-8 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
                            <Terminal className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-base font-bold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent tracking-tight">RepoMind</span>
                        <span className="hidden sm:inline text-[10px] font-medium text-slate-500 bg-slate-800/80 border border-white/5 px-2 py-0.5 rounded-full uppercase tracking-widest">AI Codebase Assistant</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {ingestionComplete && (
                            <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-white/5 px-3 py-1.5 rounded-lg transition-all">
                                <RotateCcw className="w-3 h-3" /> New Repo
                            </button>
                        )}
                        <a href="https://github.com" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors p-1.5">
                            <Github className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5" style={{ height: 'calc(100vh - 3.75rem)' }}>

                {/* ── Sidebar ── */}
                <aside className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                    <div className="bg-slate-900/80 border border-white/[0.06] p-5 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-2 mb-1">
                            <GitBranch className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-sm font-semibold text-white">Repository Source</h2>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 pl-6">Paste any public GitHub URL to analyze its codebase.</p>

                        <form onSubmit={handleIngest} className="flex flex-col gap-3">
                            <div>
                                <label htmlFor="repoUrl" className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">GitHub URL</label>
                                <input
                                    id="repoUrl"
                                    type="url"
                                    placeholder="https://github.com/owner/repo"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    required
                                    disabled={isIngesting}
                                    className="w-full bg-slate-950 border border-white/10 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white placeholder:text-slate-600 disabled:opacity-60"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isIngesting || !repoUrl}
                                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                            >
                                {isIngesting
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                                    : <><Sparkles className="w-4 h-4" /> Load Repository</>}
                            </button>
                        </form>

                        {ingestionComplete && ingestionData && (
                            <div className="mt-4 pt-4 border-t border-white/[0.06]">
                                <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-widest">Analysis Complete</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                                            <div className="text-xl font-bold text-white">{ingestionData.filesProcessed}</div>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Files</div>
                                        </div>
                                        <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                                            <div className="text-xl font-bold text-white">{ingestionData.chunksCreated}</div>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Embeddings</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── Chat Panel ── */}
                <section className="lg:col-span-8 flex flex-col bg-slate-900/80 border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden">
                    {!ingestionComplete ? (
                        /* Empty state */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <div className="bg-slate-800/40 border border-white/5 rounded-3xl p-10 max-w-sm">
                                <div className="bg-gradient-to-br from-indigo-500/20 to-violet-500/20 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <MessageSquare className="w-7 h-7 text-indigo-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">No Repository Loaded</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Paste a public GitHub URL on the left and hit <strong className="text-indigo-400">Load Repository</strong> to get an AI-powered codebase summary and start asking questions.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Tab Switcher */}
                            <div className="flex border-b border-white/[0.06]">
                                <button
                                    onClick={() => setActiveTab('chat')}
                                    className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    Chat View
                                </button>
                                <button
                                    onClick={() => setActiveTab('structure')}
                                    className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'structure' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                >
                                    <Network className="w-4 h-4" />
                                    Structure View
                                </button>
                            </div>

                            {/* ── Chat View ── */}
                            <div className={`flex flex-col flex-1 h-0 overflow-hidden ${activeTab === 'chat' ? 'flex' : 'hidden'}`}>
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
                                    {messages.map((m, idx) => {
                                        if (m.role === 'assistant' && m.streaming && !m.content) return null;
                                        return (
                                            <div key={idx} className={`flex items-start gap-2.5 message-appear ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                {m.role === 'assistant' && (
                                                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-indigo-500/20">
                                                        <Terminal className="w-3.5 h-3.5 text-white" />
                                                    </div>
                                                )}
                                                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user'
                                                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-sm shadow-lg shadow-indigo-800/20'
                                                    : 'bg-slate-800/80 text-slate-200 border border-white/[0.06] rounded-tl-sm'
                                                }`}>
                                                    {m.role === 'assistant' ? (
                                                        <>
                                                            <div className="break-words markdown-body prose prose-invert max-w-none prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 text-sm">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        code({ node, inline, className, children, ...props }) {
                                                                            const match = /language-(\w+)/.exec(className || '');
                                                                            const codeString = String(children).replace(/\n$/, '');
                                                                            
                                                                            if (!inline && match && match[1] === 'mermaid') {
                                                                                return <MermaidDiagram chart={codeString} />;
                                                                            }
                                                                            
                                                                            if (!inline && match) {
                                                                                return (
                                                                                    <pre className="code-block">
                                                                                        <code className={`lang-${match[1]}`} {...props}>
                                                                                            {children}
                                                                                        </code>
                                                                                    </pre>
                                                                                );
                                                                            }
                                                                            
                                                                            return (
                                                                                <code className={inline ? "inline-code" : ""} {...props}>
                                                                                    {children}
                                                                                </code>
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    {m.content || ''}
                                                                </ReactMarkdown>
                                                            </div>
                                                            {m.streaming && <StreamingCursor />}
                                                        </>
                                                    ) : (
                                                        <p className="break-words whitespace-pre-wrap">{m.content}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Typing dots when streaming starts */}
                                    {isStreaming && messages[messages.length - 1]?.content === '' && (
                                        <div className="flex items-start gap-2.5 justify-start">
                                            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
                                                <Terminal className="w-3.5 h-3.5 text-white" />
                                            </div>
                                            <div className="bg-slate-800/80 border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
                                                {[0, 120, 240].map(d => (
                                                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Suggestion Cards */}
                                {(isFetchingSuggestions || suggestions.length > 0) && !isStreaming && (
                                    <div className="px-4 pt-3 pb-2 border-t border-white/[0.06]">
                                        <div className="flex items-center gap-1.5 mb-2.5">
                                            <Sparkles className="w-3 h-3 text-violet-400" />
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Try asking</span>
                                        </div>

                                        {isFetchingSuggestions ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {[...Array(4)].map((_, i) => (
                                                    <div key={i} className="h-14 rounded-2xl bg-slate-800/50 border border-white/5 animate-pulse" />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {suggestions.slice(0, 4).map((s, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => sendMessage(s)}
                                                        className="suggestion-card group"
                                                    >
                                                        <span className="text-base mb-1 block">{CHIP_ICONS[i]}</span>
                                                        <p className="text-xs text-slate-300 group-hover:text-white leading-snug line-clamp-2 transition-colors">
                                                            {s}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Chat Input */}
                                <div className="px-4 py-3 border-t border-white/[0.06]">
                                    <form onSubmit={handleChat} className="relative flex items-center">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value)}
                                            placeholder={isStreaming ? 'AI is responding…' : 'Ask about the codebase…'}
                                            disabled={isStreaming}
                                            className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-5 pr-14 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white placeholder:text-slate-500 disabled:opacity-60"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!question.trim() || isStreaming}
                                            className="absolute right-2 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                    </form>
                                    <p className="text-[10px] text-slate-600 mt-1.5 text-center">Powered by Gemini · answers based on the ingested codebase.</p>
                                </div>
                            </div>

                            {/* ── Structure View ── */}
                            <div className={`flex flex-1 h-0 overflow-hidden ${activeTab === 'structure' ? 'flex' : 'hidden'}`}>
                                {isFetchingStructure ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                                        <p className="text-sm text-slate-400">Parsing AST and building dependency graph...</p>
                                    </div>
                                ) : structureData ? (
                                    <>
                                        {/* Left Sidebar: File Tree */}
                                        <div className="w-64 flex-shrink-0 h-full border-r border-white/[0.06] bg-slate-900/40">
                                            <FileTreeView 
                                                treeData={structureData.tree} 
                                                onSelectNode={setSelectedFileNode} 
                                                selectedNodeId={selectedFileNode}
                                            />
                                        </div>
                                        {/* Right Main: React Flow Graph */}
                                        <div className="flex-1 h-full relative">
                                            <a
                                                href={`/structure?repoUrl=${encodeURIComponent(repoUrl)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-medium rounded-lg border border-white/10 transition-colors backdrop-blur-md shadow-lg"
                                            >
                                                Open Full View <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                            <DependencyGraph 
                                                structureData={structureData} 
                                                onNodeClick={setSelectedFileNode}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-red-400">Failed to load repository structure.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>
    </main>
</div>
);
}
