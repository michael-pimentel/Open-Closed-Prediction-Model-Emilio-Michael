"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import SearchBar from "../components/SearchBar";

export default function Home() {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains("dark"));
        const observer = new MutationObserver(() => {
            setIsDark(el.classList.contains("dark"));
        });
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    const headingShadow = isDark
        ? { textShadow: "0 0 12px rgba(255,255,255,0.35), 0 0 24px rgba(255,255,255,0.12)" }
        : { textShadow: "0 2px 4px rgba(0,0,0,0.12)" };

    return (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Gradients — adapted for dark mode */}
            <div className="absolute top-20 -left-64 w-96 h-96 bg-emerald-200/30 dark:bg-emerald-900/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-pulse-slow"></div>
            <div className="absolute top-40 -right-64 w-96 h-96 bg-emerald-100/30 dark:bg-emerald-800/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-pulse-slow animation-delay-2000"></div>
            <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-[500px] h-[500px] bg-emerald-100/40 dark:bg-emerald-900/25 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-pulse-slow animation-delay-4000"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full flex flex-col items-center space-y-16 z-10 max-w-7xl mx-auto my-auto"
            >
                <div className="text-center space-y-6">
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

                <div className="w-full flex justify-center">
                    <SearchBar />
                </div>

            </motion.div>

        </div>
    );
}
