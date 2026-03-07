"use client";

import { useEffect, useMemo, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCityStore } from "../../store/CityResultsStore";
import { cityAnalysisEngine } from "../../lib/CityAnalysisEngine";
import { Loader2, AlertCircle, Search, MapPin, CheckCircle, XCircle } from "lucide-react";
import dynamic from "next/dynamic";

const CityMap = dynamic(() => import("../../components/CityMap"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-500 font-semibold">
            Loading Map...
        </div>
    ),
});

function CitiesContent() {
    const searchParams = useSearchParams();
    const cityQuery = searchParams.get("q");
    const [cityInput, setCityInput] = useState(cityQuery || "");
    const [isDark, setIsDark] = useState(false);

    const { cityName, isAnalyzing, progress, results, error, cityBoundary } = useCityStore();

    // Track dark mode by observing the .dark class on <html>
    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains("dark"));
        const observer = new MutationObserver(() => {
            setIsDark(el.classList.contains("dark"));
        });
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (cityQuery) {
            setCityInput(cityQuery);
            cityAnalysisEngine.runAnalysis(cityQuery);
        }
        // Only cancel on unmount — startAnalysis already resets state, so skip reset() here
        // to avoid a race where reset() fires after the new analysis has already started.
        return () => {
            cityAnalysisEngine.cancel();
        };
    }, [cityQuery]);

    const stats = useMemo(() => {
        const open = results.filter(r => r.status?.toLowerCase() === "open").length;
        const closed = results.filter(r => r.status?.toLowerCase() === "closed").length;
        const unknown = results.length - open - closed;
        return { open, closed, unknown, total: results.length };
    }, [results]);

    const mapCenter = useMemo((): [number, number] | undefined => {
        const withCoords = results.filter(r => r.lat && r.lon);
        if (withCoords.length === 0) return undefined;
        const avgLat = withCoords.reduce((s, r) => s + r.lat!, 0) / withCoords.length;
        const avgLon = withCoords.reduce((s, r) => s + r.lon!, 0) / withCoords.length;
        return [avgLat, avgLon];
    }, [results]);

    const handleCitySearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (cityInput.trim()) {
            window.location.href = `/cities?q=${encodeURIComponent(cityInput)}`;
        }
    };

    const panelBg = isDark ? "bg-gray-900/95 border-gray-700" : "bg-white/95 border-gray-100";
    const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
    const textMuted = isDark ? "text-gray-400" : "text-gray-400";
    const inputClass = isDark
        ? "text-gray-100 bg-gray-800 border-gray-600 placeholder-gray-500"
        : "text-gray-900 bg-gray-50 border-gray-200 placeholder-gray-400";

    return (
        <div className="w-full flex-1 flex flex-col relative" style={{ height: "calc(100vh - 64px)" }}>
            {/* Full-screen map */}
            <div className="absolute inset-0">
                <CityMap
                    results={results}
                    center={mapCenter}
                    boundary={cityBoundary}
                    darkMode={isDark}
                />
            </div>

            {/* Floating Search Panel */}
            <div className="absolute top-4 left-4 z-[1000] w-96 max-w-[calc(100vw-2rem)]">
                <form onSubmit={handleCitySearch} className={`${panelBg} backdrop-blur-md rounded-2xl shadow-2xl border overflow-hidden`}>
                    <div className="p-4">
                        <h2 className={`text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${textPrimary}`}>
                            <MapPin className="w-4 h-4 text-emerald-500" />
                            Cities Mode
                        </h2>
                        <div className="relative flex">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className={`block w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all ${inputClass}`}
                                placeholder="Enter a city (e.g. Santa Cruz, CA)..."
                                value={cityInput}
                                onChange={(e) => setCityInput(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Stats */}
                    {results.length > 0 && (
                        <div className={`border-t ${isDark ? "border-gray-700" : "border-gray-100"} px-4 py-3 grid grid-cols-3 gap-2 text-center`}>
                            <div className="flex flex-col items-center">
                                <div className="flex items-center gap-1 text-emerald-500">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span className="text-lg font-black">{stats.open}</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Open</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className={`flex items-center gap-1 ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span className="text-lg font-black">{stats.closed}</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Closed</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className={`text-lg font-black ${isDark ? "text-gray-200" : "text-gray-700"}`}>{stats.total}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Total</span>
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {isAnalyzing && (
                        <div className="px-4 pb-3">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
                                    Analyzing {cityName}...
                                </span>
                            </div>
                            <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                                <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </form>

                {/* Error */}
                {error && (
                    <div className="mt-3 bg-rose-50/95 backdrop-blur-sm text-rose-700 p-3 rounded-xl flex items-center gap-2 text-sm shadow-lg border border-rose-100">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs">{error}</p>
                    </div>
                )}

                {/* No data found */}
                {!isAnalyzing && !error && cityName && results.length === 0 && (
                    <div className={`mt-3 ${isDark ? "bg-gray-800/95 border-gray-700 text-gray-300" : "bg-white/95 border-gray-200 text-gray-600"} backdrop-blur-sm p-3 rounded-xl flex items-center gap-2 text-sm shadow-lg border`}>
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                        <p className="text-xs">No data found for <span className="font-semibold">{cityName}</span>. Try adding a state abbreviation, e.g. &ldquo;{cityName}, CA&rdquo;.</p>
                    </div>
                )}
            </div>

            {/* Legend — uses green/black/white theme to match marker colors */}
            <div className={`absolute bottom-6 right-4 z-[1000] ${panelBg} backdrop-blur-sm rounded-xl shadow-lg border px-4 py-3`}>
                <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow"></span>
                        <span className={isDark ? "text-gray-300" : "text-gray-600"}>Open</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-full border-2 shadow ${isDark ? "bg-gray-200 border-gray-700" : "bg-gray-900 border-white"}`}></span>
                        <span className={isDark ? "text-gray-300" : "text-gray-600"}>Closed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow"></span>
                        <span className={isDark ? "text-gray-300" : "text-gray-600"}>Unknown</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CitiesPage() {
    return (
        <Suspense
            fallback={
                <div className="w-full flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
            }
        >
            <CitiesContent />
        </Suspense>
    );
}
