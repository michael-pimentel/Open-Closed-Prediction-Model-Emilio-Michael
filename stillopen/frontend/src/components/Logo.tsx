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
        <Link href="/" className="flex items-center space-x-2.5 hover:opacity-80 transition-opacity group">
            <div className="relative flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm transition-transform group-hover:scale-110 duration-300">
                    <defs>
                        <radialGradient id="pinGrad" cx="38%" cy="32%" r="70%">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#059669" />
                        </radialGradient>
                        <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                        </radialGradient>
                        <filter id="pinShadow" x="-20%" y="-10%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#059669" floodOpacity="0.35" />
                        </filter>
                        <filter id="ringGlow" x="-15%" y="-15%" width="130%" height="130%">
                            <feGaussianBlur stdDeviation="0.8" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <circle cx="16" cy="16" r="15" fill="url(#bgGlow)" />
                    <circle cx="16" cy="16" r="13.5" stroke="#6ee7b7" strokeWidth="1" opacity="0.4" />
                    <circle cx="16" cy="16" r="13.5" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="55 30" strokeDashoffset="-8" filter="url(#ringGlow)" />
                    <circle cx="16" cy="16" r="13.5" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="18 72" strokeDashoffset="30" opacity="0.6" />
                    <ellipse cx="16" cy="27.2" rx="3.5" ry="1.2" fill="#059669" opacity="0.18" />
                    <path d="M16 25.8C15.7 25.4 9 17.8 9 13C9 9.13 12.134 6 16 6C19.866 6 23 9.13 23 13C23 17.8 16.3 25.4 16 25.8Z" fill="url(#pinGrad)" filter="url(#pinShadow)" />
                    <path d="M16 23C15.8 22.7 11 16.8 11 13C11 10.24 13.24 8 16 8C18.76 8 21 10.24 21 13C21 16.8 16.2 22.7 16 23Z" fill="#34d399" opacity="0.25" />
                    <circle cx="16" cy="13" r="3.2" fill={isDark ? "#030712" : "white"} opacity="0.95" />
                    <circle cx="15" cy="12" r="1" fill="white" opacity="0.5" />
                </svg>
            </div>
            <span
                className="text-2xl font-black tracking-tighter text-gray-900 dark:text-white transition-colors duration-200"
                style={shadowStyle}
            >
                Still<span className="text-emerald-500">Open</span>
            </span>
        </Link>
    );
}
