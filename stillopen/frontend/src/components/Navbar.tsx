"use client";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { MapPin, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
    const pathname = usePathname();
    const isHome = pathname === '/';
    const isCities = pathname === '/cities';
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
        <nav className="sticky top-0 z-40 w-full bg-white/80 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <Logo />

                {/* Show compact search bar in navbar if we aren't on the homepage */}
                {!isHome && !isCities && (
                    <div className="flex-1 max-w-md ml-8 hidden sm:block">
                        <SearchBar compact={true} />
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <Link
                        href="/cities"
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${isCities
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                            : "text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 border border-transparent"
                            }`}
                    >
                        <MapPin className="w-4 h-4" />
                        <span className="hidden sm:inline">Cities</span>
                    </Link>

                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Toggle dark mode"
                    >
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </nav>
    );
}
