"use client";

interface StatusBadgeProps {
    status: string;
    predictionType?: string;
}

export default function StatusBadge({ status, predictionType }: StatusBadgeProps) {
    const s = status.toLowerCase();

    if (predictionType === "likely_open") {
        return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">Likely Open</span>;
    }
    if (s === 'open') {
        return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">Open</span>;
    }
    if (s === 'closed') {
        return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">Closed</span>;
    }
    return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200 shadow-sm">Unknown</span>;
}
