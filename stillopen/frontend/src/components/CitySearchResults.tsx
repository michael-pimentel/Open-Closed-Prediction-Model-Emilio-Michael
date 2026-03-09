"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { geocodeCity } from "../lib/CitySearchService";
import { formatTag } from "../lib/formatters";
import { searchPlaces } from "../lib/api";
import type { SearchResultType } from "../lib/api";
import StatusBadge from "./StatusBadge";
import PaginationBar from "./PaginationBar";
import Link from "next/link";
import {
    AlertCircle, MapPin, Tag,
    CheckCircle, XCircle, List, Map as MapIcon,
} from "lucide-react";
import dynamic from "next/dynamic";

const ResultsMap = dynamic(() => import("./ResultsMap"), {
    ssr: false,
    loading: () => (
        <div className="h-full w-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-2xl flex items-center justify-center text-gray-500 font-semibold">
            Loading Map...
        </div>
    ),
});

function toTitleCase(str: string): string {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortKey = "confidence" | "name" | "status";

const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];
const DEFAULT_LIMIT = 50;

function SkeletonGrid() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-36 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
        </div>
    );
}

export default function CitySearchResults({
    query,
    city,
    initialPage = 1,
}: {
    query: string;
    city: string;
    initialPage?: number;
}) {
    const router = useRouter();
    const pathname = usePathname();

    const [results, setResults] = useState<SearchResultType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resolvedCity, setResolvedCity] = useState<string | null>(null);
    const [boundary, setBoundary] = useState<object | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("confidence");
    const [mobileView, setMobileView] = useState<"list" | "map">("list");

    // Pagination state
    const [page, setPage] = useState(initialPage);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [limit, setLimit] = useState<number>(() => DEFAULT_LIMIT);

    // Track whether geocoding has completed for this city
    const geocodeRef = useRef<{
        city: string;
        bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number } | null;
        resolved: string;
        boundary: object | null;
    } | null>(null);

    // Read saved page size from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem("stillopen_page_size");
        if (saved) {
            const n = parseInt(saved, 10);
            if (PAGE_SIZES.includes(n)) setLimit(n);
        }
    }, []);

    // Reset page when query/city changes
    useEffect(() => {
        setPage(initialPage);
    }, [initialPage]);

    // Phase 1: geocode city (once per city value)
    useEffect(() => {
        let cancelled = false;
        setBoundary(null);
        setResolvedCity(null);
        setError(null);
        setResults([]);
        setTotalCount(0);
        setTotalPages(1);
        geocodeRef.current = null;

        async function geocode() {
            try {
                const geoResult = await geocodeCity(city);
                if (cancelled) return;

                if (!geoResult) {
                    // Fallback: search by city name in DB directly (no bbox)
                    geocodeRef.current = { city, bbox: null, resolved: city, boundary: null };
                    setResolvedCity(city);
                } else {
                    const resolved = geoResult.displayName.split(",")[0].trim();
                    geocodeRef.current = {
                        city,
                        bbox: geoResult.bbox,
                        resolved,
                        boundary: geoResult.boundary ?? null,
                    };
                    setResolvedCity(resolved);
                    setBoundary(geoResult.boundary ?? null);
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    if (err instanceof Error && err.message === "THROTTLED") {
                        setError("Service temporarily throttled. Please try again in 60 seconds.");
                    } else {
                        setError(err instanceof Error ? err.message : "Could not geocode city.");
                    }
                    setLoading(false);
                }
            }
        }

        geocode();
        return () => { cancelled = true; };
    }, [city]);

    // Phase 2: fetch places once geocoding is done + on page/limit/query changes
    useEffect(() => {
        if (!geocodeRef.current) return; // geocoding not done yet
        if (geocodeRef.current.city !== city) return; // stale

        let cancelled = false;
        setLoading(true);
        setResults([]);

        const { bbox: activeBbox } = geocodeRef.current;

        searchPlaces(query, limit, activeBbox ?? undefined, (page - 1) * limit, activeBbox ? undefined : city, page)
            .then((data) => {
                if (cancelled) return;
                setResults(data.results);
                setTotalCount(data.total_count);
                setTotalPages(data.total_pages);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Search failed.");
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedCity, query, page, limit]);

    const categories = useMemo(() => {
        const cats = new Set(results.map((r) => r.category).filter(Boolean) as string[]);
        return Array.from(cats).sort();
    }, [results]);

    const stats = useMemo(() => {
        const open = results.filter((r) => r.status?.toLowerCase() === "open").length;
        const closed = results.filter((r) => r.status?.toLowerCase() === "closed").length;
        return { open, closed, total: results.length };
    }, [results]);

    const sorted = useMemo(() => {
        let list = categoryFilter ? results.filter((r) => r.category === categoryFilter) : results;
        if (sortKey === "confidence") {
            list = [...list].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
        } else if (sortKey === "name") {
            list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortKey === "status") {
            const order: Record<string, number> = { open: 0, unknown: 1, closed: 2 };
            list = [...list].sort(
                (a, b) => (order[a.status?.toLowerCase()] ?? 1) - (order[b.status?.toLowerCase()] ?? 1)
            );
        }
        return list;
    }, [results, categoryFilter, sortKey]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        setCategoryFilter(null); // reset filter on page change
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        params.set("city", city);
        params.set("page", String(newPage));
        router.push(`${pathname}?${params.toString()}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleLimitChange = (newLimit: number) => {
        localStorage.setItem("stillopen_page_size", String(newLimit));
        setLimit(newLimit);
        setPage(1);
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        params.set("city", city);
        params.set("page", "1");
        router.push(`${pathname}?${params.toString()}`);
    };

    const displayCity = resolvedCity || city;
    const queryLabel = query ? toTitleCase(query) : "All Places";

    // ---- Loading skeleton ----
    if (loading) {
        return (
            <div className="flex flex-col gap-6 w-full">
                <div className="h-9 w-72 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-6 w-16 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
                    ))}
                </div>
                <SkeletonGrid />
            </div>
        );
    }

    // ---- Error state ----
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-center gap-4">
                <AlertCircle className="w-12 h-12 text-rose-400" />
                <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">{error}</p>
            </div>
        );
    }

    // ---- Empty state ----
    if (results.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-center gap-4">
                <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">No results found</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                    No &ldquo;{query || "places"}&rdquo; found in {displayCity}. Try a broader term like{" "}
                    &ldquo;food&rdquo; or &ldquo;shop&rdquo;, or check the city name.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    {query ? (
                        <>
                            <span className="text-emerald-500">{queryLabel}</span>
                            {" in "}
                            {displayCity}
                        </>
                    ) : (
                        <>All Places in <span className="text-emerald-500">{displayCity}</span></>
                    )}
                </h1>
                <p className="text-gray-400 text-sm">
                    {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <CheckCircle className="w-4 h-4" /> {stats.open} open
                </div>
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-bold text-sm">
                    <XCircle className="w-4 h-4" /> {stats.closed} closed
                </div>
                <div className="text-gray-400 text-sm">
                    {stats.total - stats.open - stats.closed} unknown
                </div>
                {/* Page size selector */}
                <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 hidden sm:inline">Show:</span>
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
                    <span className="text-xs text-gray-400 hidden sm:inline">per page</span>
                </div>
            </div>

            {/* Category filters + sort */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={() => setCategoryFilter(null)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                        !categoryFilter
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-300"
                    }`}
                >
                    All
                </button>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                            categoryFilter === cat
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-300"
                        }`}
                    >
                        {formatTag(cat)}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400 mr-1 hidden sm:inline">Sort:</span>
                    {(["confidence", "name", "status"] as SortKey[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => setSortKey(key)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                sortKey === key
                                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                                    : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400"
                            }`}
                        >
                            {key === "confidence" ? "Confidence" : key === "name" ? "Name" : "Open first"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mobile view toggle */}
            <div className="flex lg:hidden items-center gap-2 self-end">
                <button
                    onClick={() => setMobileView("list")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                        mobileView === "list"
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                            : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-200"
                    }`}
                >
                    <List className="w-3.5 h-3.5" /> List
                </button>
                <button
                    onClick={() => setMobileView("map")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                        mobileView === "map"
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                            : "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-200"
                    }`}
                >
                    <MapIcon className="w-3.5 h-3.5" /> Map
                </button>
            </div>

            {/* Results grid + map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full h-[78vh] relative">
                {/* Scrollable result cards */}
                <div className={`flex flex-col gap-3 overflow-y-auto pr-1 pb-4 ${mobileView === "map" ? "hidden lg:flex" : "flex"}`}>
                    {sorted.map((res) => (
                        <Link
                            href={`/place/${res.id}`}
                            key={res.id}
                            className="block flex-shrink-0 w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group overflow-hidden"
                        >
                            <div className="flex gap-0">
                                {res.photo_url && (
                                    <div className="w-24 flex-shrink-0 relative self-stretch min-h-[120px] bg-gray-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={res.photo_url}
                                            alt={res.name || "Place"}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    </div>
                                )}
                                <div className="flex flex-col flex-1 min-w-0 p-4 min-h-[120px]">
                                    <div className="flex justify-between items-start gap-2">
                                        <h2 className="text-base font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-tight">
                                            {res.name || "Unknown Place"}
                                        </h2>
                                        <div className="flex-shrink-0">
                                            <StatusBadge status={res.status} />
                                        </div>
                                    </div>
                                    {res.category && (
                                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                                            <Tag className="w-3 h-3" />
                                            {formatTag(res.category!)}
                                        </span>
                                    )}
                                    {res.address && (
                                        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                                            <span className="line-clamp-2">{res.address}</span>
                                        </p>
                                    )}
                                    {(res.status === "open" || res.status === "closed") && (
                                        <div className="mt-auto pt-2 flex items-center gap-2">
                                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        (res.confidence ?? 0) > 0.75
                                                            ? "bg-emerald-500"
                                                            : (res.confidence ?? 0) >= 0.5
                                                                ? "bg-amber-400"
                                                                : "bg-rose-400"
                                                    }`}
                                                    style={{ width: `${((res.confidence ?? 0) * 100).toFixed(0)}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">
                                                {((res.confidence ?? 0) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}

                    {/* Pagination bar */}
                    <PaginationBar
                        page={page}
                        totalPages={totalPages}
                        totalCount={totalCount}
                        limit={limit}
                        offset={(page - 1) * limit}
                        onPageChange={handlePageChange}
                    />
                </div>

                {/* Map panel */}
                <div className={`h-full rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 ${mobileView === "map" ? "block" : "hidden lg:block"}`}>
                    <ResultsMap results={sorted} boundary={boundary} />
                </div>
            </div>
        </div>
    );
}
