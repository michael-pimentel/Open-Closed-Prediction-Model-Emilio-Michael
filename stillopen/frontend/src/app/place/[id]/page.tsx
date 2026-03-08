"use client";

import { useState, useEffect } from "react";
import { getPlaceDetails } from "../../../lib/api";
import ResultCard from "../../../components/ResultCard";
import Link from "next/link";
import { ArrowLeft, List, Map } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const ResultsMap = dynamic(() => import("../../../components/ResultsMap"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
    ),
});

export default function PlacePage() {
    const params = useParams();
    const id = params?.id as string;

    const [place, setPlace] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [mobileView, setMobileView] = useState<"details" | "map">("details");

    useEffect(() => {
        if (!id) return;
        getPlaceDetails(id)
            .then(data => {
                setPlace(data);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [id]);

    if (loading) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-white dark:bg-gray-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Loading…</p>
                </div>
            </div>
        );
    }

    if (error || !place) {
        return (
            <div className="w-full h-screen flex items-center justify-center px-4">
                <div className="text-center space-y-6 max-w-sm">
                    <div className="p-8 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl">
                        <h2 className="text-xl font-black text-rose-500 mb-1">Place Not Found</h2>
                        <p className="text-sm text-rose-500/70">This place doesn't exist or the API is offline.</p>
                    </div>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to search
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-[calc(100vh-var(--navbar-height,64px))] bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden">

            {/* ── Mobile toggle bar ────────────────────────────────────────── */}
            <div className="lg:hidden flex items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
                <button
                    onClick={() => setMobileView("details")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                        mobileView === "details"
                            ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                            : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                >
                    <List className="w-3.5 h-3.5" /> Details
                </button>
                <button
                    onClick={() => setMobileView("map")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                        mobileView === "map"
                            ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                            : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                >
                    <Map className="w-3.5 h-3.5" /> Map
                </button>
            </div>

            {/* ── Main split layout ────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Left: details panel (40%) */}
                <div className={`w-full lg:w-[40%] flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden ${
                    mobileView === "map" ? "hidden lg:flex" : "flex"
                }`}>
                    {/* Back link */}
                    <div className="shrink-0 px-6 pt-5 pb-3 bg-gray-50 dark:bg-gray-950">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 uppercase tracking-widest transition-colors group"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                            Back to search
                        </Link>
                    </div>

                    {/* Scrollable card content */}
                    <div className="flex-1 overflow-y-auto px-6 pb-8">
                        <ResultCard data={place} />
                    </div>
                </div>

                {/* Right: map (60%) — sticky, no scroll */}
                <div className={`w-full lg:w-[60%] relative border-l border-gray-200 dark:border-gray-800 ${
                    mobileView === "map" ? "flex" : "hidden lg:flex"
                }`}>
                    <ResultsMap results={[place]} />
                </div>
            </div>
        </div>
    );
}
