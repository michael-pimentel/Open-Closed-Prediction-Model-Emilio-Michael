"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Logo() {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains('dark'));
        const observer = new MutationObserver(() => {
            setIsDark(el.classList.contains('dark'));
        });
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const shadowStyle = isDark
        ? { textShadow: '0 0 10px rgba(255,255,255,0.4), 0 0 20px rgba(255,255,255,0.15)' }
        : { textShadow: '0 1px 3px rgba(0,0,0,0.18)' };

    return (
        <Link href="/" className="flex items-center space-x-1 hover:opacity-80 transition-opacity">
            <span
                className="text-2xl font-black tracking-tighter text-gray-900 dark:text-white transition-colors duration-200"
                style={shadowStyle}
            >
                Still<span className="text-emerald-500">Open</span>
            </span>
        </Link>
    );
}
