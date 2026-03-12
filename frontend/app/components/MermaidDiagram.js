'use client';
import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Loader2 } from 'lucide-react';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
});

let idCounter = 0;

export default function MermaidDiagram({ chart }) {
    const [svgContent, setSvgContent] = useState('');
    const [error, setError] = useState(null);
    const id = useRef(`mermaid-svg-${idCounter++}`).current;

    useEffect(() => {
        if (!chart) return;
        let isMounted = true;
        
        async function renderDiagram() {
            try {
                const { svg } = await mermaid.render(id, chart);
                if (isMounted) {
                    setSvgContent(svg);
                    setError(null);
                }
            } catch (err) {
                if (isMounted) setError(err.message || 'Failed to render Mermaid diagram');
            }
        }
        
        renderDiagram();
        
        return () => { isMounted = false; };
    }, [chart, id]);

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-xs font-mono whitespace-pre-wrap">
                <p className="font-bold mb-2">Mermaid Syntax Error:</p>
                {error}
            </div>
        );
    }

    if (!svgContent) {
        return (
            <div className="flex items-center justify-center py-4 bg-[#080c18] border border-white/10 rounded-xl my-2">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            </div>
        );
    }

    return (
        <div 
            className="w-full overflow-x-auto bg-[#080c18] border border-white/10 rounded-xl p-4 my-2 flex justify-center [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svgContent }} 
        />
    );
}
