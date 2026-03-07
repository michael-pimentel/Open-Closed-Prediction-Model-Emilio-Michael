"use client";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, AlertCircle, Info, Globe, Clock, MapPin, Phone, Tag, Database } from "lucide-react";
import { formatTag } from "../lib/formatters";

export interface PlaceDetail {
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
    explanation: string[];
    website?: string;
    phone?: string;
    opening_hours?: string;
    photo_url?: string;
}

interface ResultProps {
    data: PlaceDetail;
}

export default function ResultCard({ data }: ResultProps) {
    const statusKey = data.status.toLowerCase();
    const isOpen = statusKey === "open";
    const isClosed = statusKey === "closed";

    let colorClass = "text-gray-500";
    let bgClass = "bg-gray-50";
    let icon = <AlertCircle className="w-12 h-12" />;

    if (isOpen) {
        colorClass = "text-emerald-500";
        bgClass = "bg-emerald-50";
        icon = <CheckCircle className="w-12 h-12" />;
    } else if (isClosed) {
        colorClass = "text-rose-500";
        bgClass = "bg-rose-50";
        icon = <XCircle className="w-12 h-12" />;
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl flex flex-col border border-gray-100 dark:border-gray-800 overflow-hidden"
        >
            {/* Hero photo — only if we have a real URL */}
            {data.photo_url && (
                <div className="w-full h-56 relative flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.photo_url} alt={data.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
            )}

            <div className="p-8 sm:p-12 flex flex-col gap-8 min-h-[400px]">
                {/* Status + Name */}
                <div className="flex flex-col items-center text-center gap-4">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring" }}
                        className={`p-5 rounded-full ${bgClass} ${colorClass} drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]`}
                    >
                        {icon}
                    </motion.div>

                    <div>
                        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                            {data.name || "Unknown Place"}
                        </h2>

                        {/* Category + Source badges */}
                        {(data.category || data.source) && (
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                                {data.category && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold uppercase tracking-wider">
                                        <Tag className="w-3 h-3" /> {formatTag(data.category)}
                                    </span>
                                )}
                                {data.source && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-bold uppercase tracking-wider">
                                        <Database className="w-3 h-3" /> {data.source}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Status label */}
                        <div className={`mt-6 text-5xl font-black tracking-tighter uppercase ${colorClass}`}>
                            {data.status}
                        </div>
                        {/* Confidence bar */}
                        {(isOpen || isClosed) && (
                            <div className="mt-4 w-48 mx-auto flex flex-col items-center gap-1.5">
                                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            (data.confidence ?? 0) > 0.75
                                                ? "bg-emerald-500"
                                                : (data.confidence ?? 0) >= 0.5
                                                ? "bg-amber-400"
                                                : "bg-rose-400"
                                        }`}
                                        style={{ width: `${((data.confidence ?? 0) * 100).toFixed(0)}%` }}
                                    />
                                </div>
                                <p className="text-gray-400 dark:text-gray-500 text-xs font-semibold uppercase tracking-widest">
                                    {((data.confidence ?? 0) * 100).toFixed(0)}% confidence
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contact / location info */}
                <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    <div className="flex items-start gap-3 p-4">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" />
                        {data.address ? (
                            <span className="text-gray-700 dark:text-gray-300 text-sm">{data.address}</span>
                        ) : (
                            <span className="text-gray-400 dark:text-gray-500 italic text-sm">
                                {data.lat && data.lon ? `Coordinates: ${data.lat.toFixed(5)}, ${data.lon.toFixed(5)}` : "No address provided"}
                            </span>
                        )}
                    </div>
                    {data.opening_hours && (
                        <div className="flex items-start gap-3 p-4">
                            <Clock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" />
                            <span className="text-gray-700 dark:text-gray-300 text-sm">{data.opening_hours}</span>
                        </div>
                    )}
                    {data.phone && (
                        <div className="flex items-start gap-3 p-4">
                            <Phone className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" />
                            <a href={`tel:${data.phone}`} className="text-blue-500 hover:underline text-sm">
                                {data.phone}
                            </a>
                        </div>
                    )}
                    {data.website && (
                        <div className="flex items-start gap-3 p-4">
                            <Globe className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" />
                            <a href={data.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-sm truncate max-w-xs">
                                {data.website.replace(/^https?:\/\//, "")}
                            </a>
                        </div>
                    )}
                </div>

                {/* Signal Analysis */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-8">
                    <h3 className="text-gray-400 dark:text-gray-500 font-bold text-xs tracking-widest uppercase mb-5 flex items-center gap-2">
                        <Info className="w-4 h-4 drop-shadow-sm dark:drop-shadow-[0_1px_4px_rgba(255,255,255,0.15)]" /> Signal Analysis
                    </h3>
                    {data.explanation && data.explanation.length > 0 ? (
                        <ul className="space-y-3">
                            {data.explanation.map((item: string, idx: number) => (
                                <li key={idx} className="flex items-start text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <span className="w-2 h-2 mt-2 mr-3 bg-emerald-400 rounded-full flex-shrink-0"></span>
                                    <span className="text-sm">{item}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-500 italic text-sm">No detailed explanation available for this prediction.</p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
