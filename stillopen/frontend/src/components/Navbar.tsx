"use client";
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
    const pathname = usePathname();
    const isHome = pathname === '/';
    const isSearch = pathname.startsWith('/search') || pathname.startsWith('/place');
    const [isDark, setIsDark] = useState(false);

    // On mount, read saved preference (or system preference) and apply it
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initial = saved ? saved === 'dark' : prefersDark;
        setIsDark(initial);
        document.documentElement.classList.toggle('dark', initial);
    }, []);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
    };

    return (
        <nav className="sticky top-0 z-40 w-full bg-gray-50/95 dark:bg-gray-900/90 backdrop-blur-md border-b-2 border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <Logo />

                {/* Show compact search bar in navbar if we aren't on the homepage */}
                {!isHome && (
                    <div className="flex-1 max-w-md ml-8 hidden sm:block">
                        <SearchBar compact={true} />
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Toggle dark mode"
                    >
                        {isDark ? <Sun className="w-4 h-4 drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" /> : <Moon className="w-4 h-4 drop-shadow-sm" />}
                    </button>
                </div>
            </div>
        </nav>
    );
}
