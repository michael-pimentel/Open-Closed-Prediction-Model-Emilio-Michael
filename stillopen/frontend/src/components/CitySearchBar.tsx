"use client";
import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

export default function CitySearchBar() {
    const [city, setCity] = useState("");

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (city.trim()) {
            window.location.href = `/cities?q=${encodeURIComponent(city)}`;
        }
    }

    return (
        <form onSubmit={handleSearchSubmit} className={`relative w-full max-w-2xl px-6`}>
            <div className="relative group w-full flex">
                <div className={`absolute inset-y-0 left-0 flex items-center pointer-events-none z-10 pl-10`}>
                    <Search className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                </div>
                <input
                    type="text"
                    className={`block w-full text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pl-16 pr-6 py-6 rounded-full text-lg shadow-[0_10px_35px_rgba(0,0,0,0.15)] dark:shadow-[0_0_20px_rgba(255,255,255,0.12)] hover:shadow-[0_15px_45px_rgba(0,0,0,0.22)] dark:hover:shadow-[0_0_35px_rgba(255,255,255,0.2)]`}
                    placeholder="Enter a city name (e.g. San Francisco, CA)..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                />
            </div>
        </form>
    );
}
