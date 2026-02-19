"use client";

interface StatusBadgeProps {
    status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
    const isReady = status.toLowerCase();

    if (isReady === 'open') {
        return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">Open</span>;
    } else if (isReady === 'closed') {
        return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">Closed</span>;
    }
    return <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200 shadow-sm">Unknown</span>;
}
