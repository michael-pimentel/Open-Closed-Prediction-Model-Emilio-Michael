"use client";
import { motion } from "framer-motion";
import { MapPin, Phone, Globe, Tag, Activity, Clock, Info, Database, ExternalLink, CheckCircle2, XCircle, AlertCircle, WifiOff } from "lucide-react";
import { formatTag } from "../lib/formatters";
import StatusBadge from "./StatusBadge";

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
    confidence?: number | null;
    prediction_type?: string;
    explanation: string[];
    website?: string;
    phone?: string;
    opening_hours?: string;
    photo_url?: string;
    website_status?: string;        // "active"|"likely_closed"|"inconclusive"
    website_checked_at?: string;    // ISO-8601 timestamp
    website_http_code?: number;
}

interface ResultProps {
    data: PlaceDetail;
}

export default function ResultCard({ data }: ResultProps) {
    const hasConfidence = data.confidence != null && data.prediction_type !== "likely_open";
    const conf = hasConfidence ? Math.round((data.confidence ?? 0) * 100) : null;
    const isOpen   = data.status?.toLowerCase() === "open";
    const isClosed = data.status?.toLowerCase() === "closed";
    const accentColor = isOpen ? "#10b981" : isClosed ? "#f43f5e" : "#6b7280";

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full space-y-6"
        >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
                {/* Chips */}
                <div className="flex flex-wrap items-center gap-2">
                    {data.category && (
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            <Tag className="w-3 h-3" /> {formatTag(data.category)}
                        </span>
                    )}
                    {data.source && (
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            <Database className="w-3 h-3" /> {data.source}
                        </span>
                    )}
                </div>

                {/* Name */}
                <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tighter leading-tight">
                    {data.name || "Unknown Place"}
                </h2>

                {/* Address */}
                {data.address && (
                    <div className="flex items-start gap-2 text-gray-500 dark:text-gray-400">
                        <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-sm">{data.address}</span>
                    </div>
                )}

                {/* Status + Confidence row */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                    <StatusBadge status={data.status} predictionType={data.prediction_type} />
                    {hasConfidence && conf !== null ? (
                        <div className="flex items-center gap-2">
                            <div className="relative w-10 h-10">
                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
                                        className="text-gray-100 dark:text-gray-800" strokeWidth="3" />
                                    <circle cx="18" cy="18" r="15" fill="none"
                                        stroke={accentColor} strokeWidth="3"
                                        strokeDasharray={`${conf * 0.942} 100`}
                                        strokeLinecap="round" />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-gray-700 dark:text-gray-200">
                                    {conf}%
                                </span>
                            </div>
                            <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-tight">
                                Model<br />confidence
                            </div>
                        </div>
                    ) : (
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Insufficient data
                        </span>
                    )}
                </div>
            </div>

            {/* ── Contact & Hours ─────────────────────────────────────────── */}
            {(data.phone || data.website || data.opening_hours) && (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-3">
                    <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">
                        Contact & Hours
                    </h3>
                    {data.opening_hours && (
                        <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                            <Clock className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="leading-relaxed">{data.opening_hours}</span>
                        </div>
                    )}
                    {data.phone && (
                        <a href={`tel:${data.phone}`}
                            className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors group">
                            <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>{data.phone}</span>
                        </a>
                    )}
                    {data.website && (
                        <a href={data.website} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400 hover:underline group">
                            <Globe className="w-4 h-4 shrink-0" />
                            <span className="truncate">{data.website.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                    )}
                </div>
            )}

            {/* ── Model Signal Intelligence ────────────────────────────────── */}
            {data.explanation && data.explanation.length > 0 && (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] flex items-center gap-2">
                        <Info className="w-3.5 h-3.5 text-emerald-500" /> Model Signal Intelligence
                    </h3>
                    <div className="space-y-3">
                        {data.explanation.map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.06, duration: 0.35 }}
                                className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors"
                            >
                                <Activity className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {item}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Website Verification ────────────────────────────────────── */}
            {data.website_status && data.website_status !== "unchecked" && (() => {
                const isOffline = data.website_status === "likely_closed";
                const isActive  = data.website_status === "active";

                const Icon = isActive ? CheckCircle2 : isOffline ? XCircle : AlertCircle;
                const iconColor = isActive
                    ? "text-emerald-500"
                    : isOffline
                    ? "text-rose-500"
                    : "text-gray-400 dark:text-gray-500";
                const label = isActive
                    ? "Website active"
                    : isOffline
                    ? "Website offline"
                    : "Website inconclusive";

                const checkedDate = data.website_checked_at
                    ? new Date(data.website_checked_at).toLocaleDateString(undefined, {
                        year: "numeric", month: "short", day: "numeric",
                      })
                    : null;

                return (
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
                        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] flex items-center gap-2">
                            <WifiOff className="w-3.5 h-3.5 text-emerald-500" /> Website Verification
                        </h3>

                        {/* Status row */}
                        <div className="flex items-center gap-3">
                            <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${iconColor}`}>{label}</p>
                                {checkedDate && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                        Checked {checkedDate}
                                        {data.website_http_code ? ` · HTTP ${data.website_http_code}` : ""}
                                    </p>
                                )}
                            </div>
                            {data.website && (
                                <a
                                    href={data.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors shrink-0"
                                >
                                    <ExternalLink className="w-3 h-3" /> Check yourself
                                </a>
                            )}
                        </div>

                        {/* Offline notice */}
                        {isOffline && (
                            <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-xl">
                                <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">
                                    Website appears to be offline — this business may be permanently closed.
                                </p>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ── Coordinates (if no address but has lat/lon) ──────────────── */}
            {!data.address && data.lat && data.lon && (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] mb-3">
                        Coordinates
                    </h3>
                    <div className="flex items-center gap-2 text-sm font-mono text-gray-600 dark:text-gray-400">
                        <MapPin className="w-4 h-4 text-emerald-500" />
                        {data.lat.toFixed(5)}, {data.lon.toFixed(5)}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
