"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const messages = [
  "Checking recent updates…",
  "Verifying source consensus…",
  "Analyzing digital footprint…",
  "Estimating operational probability…"
];

export default function LoadingView({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Total animation time around 3-4s
    const stepDuration = 800; 
    const interval = setInterval(() => {
      setIndex((prev) => {
        if (prev === messages.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 1000); // Hold last message briefly before transition
          return prev;
        }
        return prev + 1;
      });
    }, stepDuration);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-12 w-full">
      <div className="relative w-24 h-24">
        {/* Outer Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 w-full h-full border-4 border-gray-100 rounded-full"
        />
        {/* Spinning Segment */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 w-full h-full border-4 border-transparent border-t-emerald-500 rounded-full"
        />
        {/* Inner Pulse */}
        <div className="absolute inset-4 bg-emerald-50 rounded-full animate-pulse opacity-50"></div>
      </div>
      
      <div className="h-12 relative w-full text-center max-w-md">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-gray-500 font-medium text-lg absolute w-full left-0 right-0 tracking-tight"
          >
            {messages[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
