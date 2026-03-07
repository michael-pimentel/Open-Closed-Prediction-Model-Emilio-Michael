"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import SearchBar from "../components/SearchBar";
import { searchPlacesByBbox } from "../lib/CitySearchService";
import { formatTag } from "../lib/formatters";
import type { SearchResultType } from "../components/SearchResults";

// Santa Cruz, CA bounding box
const SANTA_CRUZ_BBOX = {
    min_lat: 36.9596,
    max_lat: 37.0596,
    min_lon: -122.0733,
    max_lon: -121.9733,
};

const CATEGORY_MAP: Record<string, string> = {
    "cinema": "Cinema",
    "movie": "Cinema",
    "college": "College",
    "university": "College",
    "restaurant": "Restaurants",
    "cafe": "Cafes",
    "coffee": "Cafes",
    "bar": "Bars",
    "pub": "Bars",
    "ice_cream": "Ice Cream",
    "ice cream": "Ice Cream",
    "gelato": "Ice Cream"
};

function getCanonicalCategory(raw?: string): string | null {
    if (!raw) return null;
    const cat = raw.toLowerCase();
    for (const [key, value] of Object.entries(CATEGORY_MAP)) {
        if (cat.includes(key)) return value;
    }
    return null;
}

function MiniCard({ place }: { place: SearchResultType }) {
    const [isHovered, setIsHovered] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const status = place.status?.toLowerCase();
    const isOpen = status === "open";
    const isClosed = status === "closed";
    const conf = place.confidence ?? 0;
    const canonicalCategory = getCanonicalCategory(place.category);

    const badgeClass = isOpen
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : isClosed
            ? "bg-rose-100 text-rose-800 border-rose-200"
            : "bg-gray-100 text-gray-600 border-gray-200";

    const barColor =
        conf > 0.75 ? "bg-emerald-500" : conf >= 0.5 ? "bg-amber-400" : "bg-rose-400";

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        // Maintain clarity for 3 seconds before fading back
        timeoutRef.current = setTimeout(() => {
            setIsHovered(false);
        }, 3000);
    };

    return (
        <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="tile-card flex flex-col gap-2 px-4 py-3 rounded-xl border shadow-sm w-48 flex-shrink-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white pointer-events-auto transition-opacity duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ opacity: isHovered ? 0.8 : 0.1 }}
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold leading-tight line-clamp-2 flex-1">
                    {place.name}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border flex-shrink-0 ${badgeClass}`}>
                    {isOpen ? "Open" : isClosed ? "Closed" : "?"}
                </span>
            </div>
            {canonicalCategory && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">
                    {canonicalCategory}
                </span>
            )}
            {(isOpen || isClosed) && (
                <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${(conf * 100).toFixed(0)}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-gray-400 font-semibold tabular-nums">
                        {(conf * 100).toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    );
}

function CardRow({
    places,
    animClass,
    hiddenOnMobile = false,
}: {
    places: SearchResultType[];
    animClass: string;
    hiddenOnMobile?: boolean;
}) {
    if (places.length === 0) return null;
    // Duplicate for seamless loop
    const looped = [...places, ...places];
    return (
        <div className={`flex gap-6 md:gap-8 ${animClass} ${hiddenOnMobile ? 'hidden md:flex' : 'flex'}`} style={{ width: "max-content" }}>
            {looped.map((p, i) => (
                <MiniCard key={`${p.id}-${i}`} place={p} />
            ))}
        </div>
    );
}

export default function Home() {
    const [isDark, setIsDark] = useState(false);
    const [bgPlaces, setBgPlaces] = useState<SearchResultType[]>([]);

    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains("dark"));
        const observer = new MutationObserver(() =>
            setIsDark(el.classList.contains("dark"))
        );
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        // Fetch tiles with strict category control
        searchPlacesByBbox(SANTA_CRUZ_BBOX, 150)
            .then((data: SearchResultType[]) => {
                const results = data || [];
                // Filter and ensure category mapping exists
                const filtered = results.filter(p => !!getCanonicalCategory(p.category));
                setBgPlaces(filtered);
            })
            .catch(() => setBgPlaces([]));
    }, []);

    const headingShadow = isDark
        ? { textShadow: "0 0 12px rgba(255,255,255,0.35), 0 0 24px rgba(255,255,255,0.12)" }
        : { textShadow: "0 2px 4px rgba(0,0,0,0.12)" };

    // Distribute places across 5 rows evenly
    const rows: SearchResultType[][] = [[], [], [], [], []];
    bgPlaces.forEach((p, i) => {
        rows[i % 5].push(p);
    });

    return (
        <>
            <style>{`
                @keyframes scroll-left {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                @keyframes scroll-right {
                    from { transform: translateX(-50%); }
                    to   { transform: translateX(0); }
                }
                .bg-scroll-slow   { animation: scroll-left  100s linear infinite; will-change: transform; }
                .bg-scroll-medium { animation: scroll-left  75s linear infinite; will-change: transform; }
                .bg-scroll-fast   { animation: scroll-left  50s linear infinite; will-change: transform; }
                .bg-scroll-rev    { animation: scroll-right 85s linear infinite; will-change: transform; }
                .bg-scroll-rev-fast { animation: scroll-right 60s linear infinite; will-change: transform; }
                
                @media (max-width: 767px) {
                    .tile-card {
                        transform: scale(1.2);
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .bg-scroll-slow,
                    .bg-scroll-medium,
                    .bg-scroll-fast,
                    .bg-scroll-rev,
                    .bg-scroll-rev-fast { animation: none; }
                }
            `}</style>

            <div
                className="w-full flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-500"
                style={{ backgroundColor: isDark ? "#0a0a0a" : "#f9fafb" }}
            >

                {/* ── Animated card rows (background layer) ── */}
                {bgPlaces.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className="absolute inset-0 flex flex-col justify-center gap-10 md:gap-14 overflow-hidden pointer-events-none"
                        aria-hidden="true"
                    >
                        <CardRow places={rows[0]} animClass="bg-scroll-slow" />
                        <CardRow places={rows[1]} animClass="bg-scroll-rev" hiddenOnMobile={true} />
                        <CardRow places={rows[2]} animClass="bg-scroll-medium" />
                        <CardRow places={rows[3]} animClass="bg-scroll-rev-fast" hiddenOnMobile={true} />
                        <CardRow places={rows[4]} animClass="bg-scroll-fast" />
                    </motion.div>
                )}

                {/* ── Gradient vignette — blurs cards into background ── */}
                <div
                    className="absolute inset-0 pointer-events-none z-[1]"
                    style={{
                        background: isDark
                            ? [
                                "linear-gradient(to bottom, #0a0a0a 0%, transparent 25%, transparent 75%, #0a0a0a 100%)",
                                "linear-gradient(to right,  #0a0a0a 0%, transparent 20%, transparent 80%, #0a0a0a 100%)",
                                "radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, rgba(10,10,10,0.7) 100%)",
                            ].join(", ")
                            : [
                                "linear-gradient(to bottom, rgb(249 250 251) 0%, transparent 25%, transparent 75%, rgb(249 250 251) 100%)",
                                "linear-gradient(to right,  rgb(249 250 251) 0%, transparent 20%, transparent 80%, rgb(249 250 251) 100%)",
                                "radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, rgba(249,250,251,0.65) 100%)",
                            ].join(", "),
                    }}
                />

                {/* ── Original emerald glow blobs (above vignette for depth) ── */}
                <div className="absolute top-20 -left-64 w-96 h-96 bg-emerald-200/30 dark:bg-emerald-900/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-20 animate-pulse-slow z-[2] pointer-events-none" />
                <div className="absolute top-40 -right-64 w-96 h-96 bg-emerald-100/30 dark:bg-emerald-800/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-20 animate-pulse-slow animation-delay-2000 z-[2] pointer-events-none" />

                {/* ── Foreground search UI ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full flex flex-col items-center space-y-16 z-10 max-w-7xl mx-auto my-auto pointer-events-none"
                >
                    <div className="text-center space-y-6 pointer-events-auto">
                        <h1
                            className="text-6xl sm:text-7xl font-black tracking-tighter text-gray-900 dark:text-white transition-colors duration-200"
                            style={headingShadow}
                        >
                            Still<span className="text-emerald-500">Open</span>
                        </h1>
                        <p className="text-xl sm:text-2xl text-gray-500 dark:text-gray-400 font-light max-w-xl mx-auto leading-relaxed">
                            Open or Closed prediction model powered by{" "}
                            <span className="font-semibold text-gray-800 dark:text-gray-200">open source data!</span>
                        </p>
                    </div>

                    <div className="w-full flex justify-center pointer-events-auto">
                        <SearchBar />
                    </div>
                </motion.div>

            </div>
        </>
    );
}
