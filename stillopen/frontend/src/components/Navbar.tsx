"use client";
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import SearchBar from './SearchBar';

export default function Navbar() {
    const pathname = usePathname();
    const isHome = pathname === '/';

    return (
        <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <Logo />

                {/* Show compact search bar in navbar if we aren't on the homepage */}
                {!isHome && (
                    <div className="flex-1 max-w-md ml-8 hidden sm:block">
                        <SearchBar compact={true} />
                    </div>
                )}

                <div className="flex space-x-4 ml-auto">
                    {/* Add any links here */}
                </div>
            </div>
        </nav>
    );
}
