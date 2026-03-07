"use client";
import React from "react";
import { Shield, Copyright, ExternalLink } from "lucide-react";

export default function Footer() {
    return (
        <footer className="w-full bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800 py-6 px-4 sm:px-8 lg:px-12">
            <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[11px] font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2.5">

                        <span>Developed For <span className="text-gray-700 dark:text-gray-200">Overture Maps Foundation</span></span>
                    </div>
                    <span className="hidden md:inline opacity-20">|</span>
                    <div className="flex items-center gap-1.5">
                        <Copyright className="w-3.5 h-3.5 text-emerald-500/80" />
                        <span>Apache 2.0 License</span>
                    </div>
                </div>

                {/* Right side: Links & Version */}
                <div className="flex items-center gap-5 text-[10px] font-black tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500">
                    <a href="https://overturemaps.org" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors flex items-center gap-1">
                        Overture <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="opacity-30">|</span>
                    <a href="https://github.com/project-terraforma/Open-Closed-Prediction-Model-Emilio-Michael" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors flex items-center gap-1">
                        GitHub <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="opacity-20 hidden sm:inline">|</span>
                    <span className="hidden sm:inline">v1.0.0</span>
                </div>

            </div>
        </footer>
    );
}
