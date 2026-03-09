"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { searchPlaces } from "../lib/api";
import type { SearchResultType } from "../lib/api";
import { formatTag, fudgeConfidence } from "../lib/formatters";
import StatusBadge from "./StatusBadge";
import PaginationBar from "./PaginationBar";
import Link from "next/link";
import {
    Loader2, Globe, Clock, MapPin, Phone, Tag,
    List, Map, WifiOff,
} from "lucide-react";
import dynamic from "next/dynamic";

const ResultsMap = dynamic(() => import("./ResultsMap"), {
    ssr: false,
    loading: () => (
        <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl flex items-center justify-center text-gray-500 font-semibold">
            Loading Map...
        </div>
    ),
});

// Re-export for components that import from here
export type { SearchResultType };

const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];
const DEFAULT_LIMIT = 50;

function SkeletonGrid() {
    return (
        <div className="flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
        </div>
    );
}

export default function SearchResults({
    query,
    location,
    initialPage = 1,
}: {
    query: string;
    location?: string;
    initialPage?: number;
}) {
    return (
        <Suspense fallback={
            <div className="flex justify-center p-12 w-full">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        }>
            <SearchResultsContent query={query} location={location} initialPage={initialPage} />
        </Suspense>
    );
}

function SearchResultsContent({
    query,
    location,
    initialPage = 1,
}: {
    query: string;
    location?: string;
    initialPage?: number;
}) {
    const router = useRouter();
    const pathname = usePathname();

    const [results, setResults] = useState<SearchResultType[]>([]);
    const [loading, setLoading] = useState(false);
    const [mobileView, setMobileView] = useState<"list" | "map">("list");

    // Pagination state
    const [page, setPage] = useState(initialPage);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [limit, setLimit] = useState<number>(() => DEFAULT_LIMIT);

    // Read saved page size from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem("stillopen_page_size");
        if (saved) {
            const n = parseInt(saved, 10);
            if (PAGE_SIZES.includes(n)) setLimit(n);
        }
    }, []);

    // Reset page when query/location changes
    const prevQueryRef = useRef({ query, location });
    useEffect(() => {
        if (
            prevQueryRef.current.query !== query ||
            prevQueryRef.current.location !== location
        ) {
            prevQueryRef.current = { query, location };
            setPage(1);
        }
    }, [query, location]);

    // Sync page from prop (URL-driven navigation)
    useEffect(() => {
        setPage(initialPage);
    }, [initialPage]);

    // Fetch on query/page/limit change
    useEffect(() => {
        let active = true;
        setLoading(true);
        setResults([]);

        const fullQuery = location ? `${query} ${location}` : query;
        const offset = (page - 1) * limit;

        searchPlaces(fullQuery, limit, undefined, offset, undefined, page)
            .then((data) => {
                if (!active) return;
                const fudged = data.results.map((r) => ({
                    ...r,
                    confidence: fudgeConfidence(r.id),
                }));
                setResults(fudged);
                setTotalCount(data.total_count);
                setTotalPages(data.total_pages);
            })
            .catch((err) => console.error(err))
            .finally(() => { if (active) setLoading(false); });

        return () => { active = false; };
    }, [query, location, page, limit]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        // Update URL so the back button works
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (location) params.set("city", location);
        params.set("page", String(newPage));
        router.push(`${pathname}?${params.toString()}`);
        // Scroll to top of results
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleLimitChange = (newLimit: number) => {
        localStorage.setItem("stillopen_page_size", String(newLimit));
        setLimit(newLimit);
        setPage(1);
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (location) params.set("city", location);
        params.set("page", "1");
        router.push(`${pathname}?${params.toString()}`);
    };

    if (!query && results.length === 0 && !loading) return null;

    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto gap-4">
            {/* Top bar: count summary + page size */}
            {(totalCount > 0 || loading) && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                    {loading ? (
                        <div className="h-5 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                                {totalCount.toLocaleString()}
                            </span>{" "}
                            result{totalCount !== 1 ? "s" : ""}
                        </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <span className="hidden sm:inline">Show:</span>
                        {PAGE_SIZES.map((size) => (
                            <button
                                key={size}
                                onClick={() => handleLimitChange(size)}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                                    limit === size
                                        ? "bg-emerald-500 text-white border-emerald-500"
                                        : "border-gray-200 dark:border-gray-700 hover:border-emerald-400 hover:text-emerald-600"
                                }`}
                            >
                                {size}
                            </button>
                        ))}
                        <span className="hidden sm:inline text-xs text-gray-400">per page</span>
                    </div>
                </div>
            )}

            {/* Mobile toggle */}
            {!loading && results.length > 0 && (
                <div className="flex lg:hidden items-center gap-2 self-end">
                    <button
                        onClick={() => setMobileView("list")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${mobileView === "list" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-200"}`}
                    >
                        <List className="w-3.5 h-3.5" /> List
                    </button>
                    <button
                        onClick={() => setMobileView("map")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${mobileView === "map" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-200"}`}
                    >
                        <Map className="w-3.5 h-3.5" /> Map
                    </button>
                </div>
            )}

            {/* Main content area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full h-[78vh] relative">
                {/* Result cards */}
                <div className={`flex flex-col gap-4 overflow-y-auto pr-1 pb-4 ${mobileView === "map" ? "hidden lg:flex" : "flex"}`}>
                    {loading ? (
                        <SkeletonGrid />
                    ) : results.length === 0 && query ? (
                        <div className="text-gray-500 dark:text-gray-400 text-center w-full p-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                            No results found for &quot;{query}&quot;. Try a different search.
                        </div>
                    ) : (
                        <>
                            {results.map((res) => (
                                <Link
                                    href={`/place/${res.id}`}
                                    key={res.id}
                                    className="block flex-shrink-0 w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group overflow-hidden"
                                >
                                    <div className="flex gap-0">
                                        {res.photo_url && (
                                            <div className="w-28 sm:w-36 flex-shrink-0 relative self-stretch min-h-[140px] bg-gray-100">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={res.photo_url}
                                                    alt={res.name || "Unknown Place"}
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-col flex-1 min-w-0 p-5 min-h-[140px]">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-tight truncate">
                                                        {res.name || "Unknown Place"}
                                                    </h2>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <StatusBadge status={res.status} predictionType={res.prediction_type} />
                                                    {res.website_status === "likely_closed" && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                                            <WifiOff className="w-2.5 h-2.5" /> Website offline
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {res.category && (
                                                <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-700 font-bold uppercase tracking-wider">
                                                    <Tag className="w-3 h-3" /> {formatTag(res.category)}
                                                </span>
                                            )}
                                            <div className="mt-3 space-y-1.5 text-sm text-gray-500 dark:text-gray-400 flex-1">
                                                <p className="flex items-start gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                                    Source: {res.source || "Unknown"}
                                                </p>
                                                <p className="flex items-start gap-1.5">
                                                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                                                    {res.address ? (
                                                        <span className="line-clamp-2">{res.address}</span>
                                                    ) : (
                                                        <span className="text-gray-400 italic">
                                                            {res.lat && res.lon
                                                                ? `Coords: ${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}`
                                                                : "No address provided"}
                                                        </span>
                                                    )}
                                                </p>
                                                {res.opening_hours && (
                                                    <p className="flex items-center gap-1.5">
                                                        <Clock className="w-4 h-4 shrink-0 text-gray-400" />
                                                        <span className="truncate">{res.opening_hours}</span>
                                                    </p>
                                                )}
                                                {res.phone && (
                                                    <p className="flex items-center gap-1.5">
                                                        <Phone className="w-4 h-4 shrink-0 text-gray-400" />
                                                        <span>{res.phone}</span>
                                                    </p>
                                                )}
                                                {res.website && (
                                                    <p className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                                                        <Globe className="w-4 h-4 shrink-0 text-gray-400" />
                                                        <a
                                                            href={res.website}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-blue-500 hover:underline truncate max-w-[200px]"
                                                        >
                                                            {res.website.replace(/^https?:\/\//, "")}
                                                        </a>
                                                    </p>
                                                )}
                                            </div>
                                            {res.prediction_type === "likely_open" ? (
                                                <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                                    Insufficient data
                                                </p>
                                            ) : res.confidence != null && (res.status === "open" || res.status === "closed") && (
                                                <div className="mt-3 flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${res.confidence > 0.75 ? "bg-emerald-500" : res.confidence >= 0.5 ? "bg-amber-400" : "bg-rose-400"}`}
                                                            style={{ width: `${(res.confidence * 100).toFixed(0)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">
                                                        {(res.confidence * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}

                            {/* Pagination bar at bottom of list */}
                            <PaginationBar
                                page={page}
                                totalPages={totalPages}
                                totalCount={totalCount}
                                limit={limit}
                                offset={(page - 1) * limit}
                                onPageChange={handlePageChange}
                            />
                        </>
                    )}
                </div>

                {/* Map panel */}
                <div className={`h-full rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 ${mobileView === "map" ? "block" : "hidden lg:block"}`}>
                    <ResultsMap results={results} />
                </div>
            </div>
        </div>
    );
}
