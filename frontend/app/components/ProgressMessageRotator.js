import { useState, useEffect } from 'react';

export default function ProgressMessageRotator({ messages, interval = 2000 }) {
    const [index, setIndex] = useState(0);
    const [fade, setFade] = useState('opacity-100');

    useEffect(() => {
        if (!messages || messages.length === 0) return;

        const timer = setInterval(() => {
            setFade('opacity-0');
            setTimeout(() => {
                setIndex((prevIndex) => (prevIndex + 1) % messages.length);
                setFade('opacity-100');
            }, 300); // fade out transition time
        }, interval);

        return () => clearInterval(timer);
    }, [messages, interval]);

    if (!messages || messages.length === 0) return null;

    return (
        <span className={`transition-opacity duration-300 ease-in-out inline-block ${fade}`}>
            {messages[index]}
        </span>
    );
}
