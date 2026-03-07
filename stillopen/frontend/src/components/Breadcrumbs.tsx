"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Home, Search as SearchIcon, MapPin, Tag } from "lucide-react";
import { formatTag } from "../lib/formatters";

export default function Breadcrumbs() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const query = searchParams.get("q");
    const city = searchParams.get("city");

    // Breadcrumb logic:
    // If homepage: Home
    // If search: Home > Search
    // If search with query: Home > Search > [Query]
    // If search with query and city: Home > Search > [Query] > [City]

    const isHome = pathname === "/";
    const isSearch = pathname.startsWith("/search");
    const isPlace = pathname.startsWith("/place");

    if (isHome) return null;

    return (
        <nav className="flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-400 overflow-x-auto no-scrollbar py-1">
            <Link
                href="/"
                className="flex items-center hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
                tabIndex={0}
            >
                <Home className="w-3 h-3 mr-1" />
                <span>StillOpen</span>
            </Link>

            {(isSearch || isPlace) && (
                <>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <Link
                        href="/search"
                        className="flex items-center hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
                        tabIndex={0}
                    >
                        <SearchIcon className="w-3 h-3 mr-1" />
                        <span>Search</span>
                    </Link>
                </>
            )}

            {isSearch && query && (
                <>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <div className="flex items-center text-gray-900 dark:text-white shrink-0">
                        <Tag className="w-3 h-3 mr-1 text-emerald-500" />
                        <span className="max-w-[100px] truncate">{formatTag(query)}</span>
                    </div>
                </>
            )}

            {isSearch && city && (
                <>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <div className="flex items-center text-gray-900 dark:text-white shrink-0">
                        <MapPin className="w-3 h-3 mr-1 text-emerald-500" />
                        <span className="max-w-[100px] truncate">{city}</span>
                    </div>
                </>
            )}

            {isPlace && (
                <>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <div className="flex items-center text-gray-900 dark:text-white shrink-0">
                        <Tag className="w-3 h-3 mr-1 text-emerald-500" />
                        <span>Place Details</span>
                    </div>
                </>
            )}
        </nav>
    );
}
