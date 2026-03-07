"use client";
import { useEffect, useState } from "react";
import { searchPlaces } from "../lib/api";
import StatusBadge from "./StatusBadge";
import Link from "next/link";
import { Loader2, Globe, Clock, MapPin, Phone, Tag, List, Map } from "lucide-react";
import dynamic from "next/dynamic";

const ResultsMap = dynamic(() => import("./ResultsMap"), {
    ssr: false,
    loading: () => (
        <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl flex items-center justify-center text-gray-500 font-semibold">
            Loading Map...
        </div>
    ),
});

export interface SearchResultType {
    id: string;
    name: string;
    address: string;
    category?: string;
    lat?: number;
    lon?: number;
    source?: string;
    metadata_json?: Record<string, unknown>;
    status: string;
    confidence: number;
    website?: string;
    phone?: string;
    opening_hours?: string;
    photo_url?: string;
}

export default function SearchResults({ query }: { query: string }) {
    const [results, setResults] = useState<SearchResultType[]>([]);
    const [loading, setLoading] = useState(false);
    const [mobileView, setMobileView] = useState<"list" | "map">("list");

    useEffect(() => {
        let active = true;
        if (!query) {
            setTimeout(() => { if (active) setResults([]); }, 0);
            return;
        }
        setTimeout(() => { if (active) setLoading(true); }, 0);
        searchPlaces(query)
            .then((data) => { if (active) setResults(data); })
            .catch((err) => console.error(err))
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [query]);

    if (loading) {
        return (
            <div className="flex justify-center p-12 w-full">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (results.length === 0 && query) {
        return (
            <div className="text-gray-500 dark:text-gray-400 text-center w-full p-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                No results found for &quot;{query}&quot;. Try a different search.
            </div>
        );
    }

    if (results.length === 0) return null;

    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto gap-4">
            {/* Mobile toggle — only visible below lg */}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full h-[78vh] relative">
            {/* Scrollable result cards */}
            <div className={`flex flex-col gap-4 overflow-y-auto pr-1 pb-12 ${mobileView === "map" ? "hidden lg:flex" : "flex"}`}>
                {results.map((res) => (
                    <Link
                        href={`/place/${res.id}`}
                        key={res.id}
                        className="block flex-shrink-0 w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group overflow-hidden"
                    >
                        <div className="flex gap-0">
                            {/* Photo thumbnail — only if real URL */}
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
                                {/* Name + status */}
                                <div className="flex justify-between items-start gap-2">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-tight">
                                        {res.name || "Unknown Place"}
                                    </h2>
                                    <div className="flex-shrink-0">
                                        <StatusBadge status={res.status} />
                                    </div>
                                </div>

                                {/* Category */}
                                {res.category && (
                                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-700 font-bold uppercase tracking-wider">
                                        <Tag className="w-3 h-3" /> {res.category}
                                    </span>
                                )}

                                {/* Details block */}
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
                                                {res.lat && res.lon ? `Coords: ${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}` : "No address provided"}
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
                                        <p
                                            className="flex items-center gap-1.5"
                                            onClick={(e) => e.preventDefault()}
                                        >
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

                                {/* Confidence footer */}
                                {(res.status === "open" || res.status === "closed") && (
                                    <div className="mt-3 flex items-center gap-2">
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
            </div>

            {/* Map panel */}
            <div className={`h-full rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 ${mobileView === "map" ? "block" : "hidden lg:block"}`}>
                <ResultsMap results={results} />
            </div>
        </div>
        </div>
    );
}
