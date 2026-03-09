"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
    page: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    offset: number;
    onPageChange: (page: number) => void;
}

/** Returns an array of page numbers and "..." sentinels. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [1];
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);
    if (start > 2) pages.push("...");
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < total - 1) pages.push("...");
    pages.push(total);
    return pages;
}

export default function PaginationBar({ page, totalPages, totalCount, limit, offset, onPageChange }: Props) {
    if (totalPages <= 1) return null;

    const pageNumbers = getPageNumbers(page, totalPages);
    const showing_from = offset + 1;
    const showing_to = Math.min(offset + limit, totalCount);

    return (
        <div className="flex flex-col items-center gap-3 py-4">
            {/* Count summary */}
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {showing_from.toLocaleString()}–{showing_to.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {totalCount.toLocaleString()}
                </span>{" "}
                results
            </p>

            {/* Page buttons */}
            <div className="flex items-center gap-1 flex-wrap justify-center">
                {/* Prev */}
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronLeft className="w-4 h-4" /> Prev
                </button>

                {pageNumbers.map((p, i) =>
                    p === "..." ? (
                        <span
                            key={`ellipsis-${i}`}
                            className="px-2 text-gray-400 dark:text-gray-500 select-none"
                        >
                            …
                        </span>
                    ) : (
                        <button
                            key={p}
                            onClick={() => onPageChange(p as number)}
                            className={`w-9 h-9 rounded-lg text-sm font-bold border transition-all ${
                                p === page
                                    ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600"
                            }`}
                        >
                            {p}
                        </button>
                    )
                )}

                {/* Next */}
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
