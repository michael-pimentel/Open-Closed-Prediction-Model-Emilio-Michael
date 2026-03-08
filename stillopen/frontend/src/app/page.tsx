"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import SearchBar from "../components/SearchBar";

// ── City dot locations (~40 realistic world cities) ────────────────────────────
const RANDOM_DOTS = [
    { lat: 40.7128, lng: -74.006 }, // New York
    { lat: 51.5074, lng: -0.1278 }, // London
    { lat: 48.8566, lng: 2.3522 }, // Paris
    { lat: 35.6762, lng: 139.6503 }, // Tokyo
    { lat: -33.8688, lng: 151.2093 }, // Sydney
    { lat: 55.7558, lng: 37.6173 }, // Moscow
    { lat: 28.6139, lng: 77.209 }, // Delhi
    { lat: -23.5505, lng: -46.6333 }, // São Paulo
    { lat: 31.2304, lng: 121.4737 }, // Shanghai
    { lat: 19.4326, lng: -99.1332 }, // Mexico City
    { lat: 1.3521, lng: 103.8198 }, // Singapore
    { lat: 37.9838, lng: 23.7275 }, // Athens
    { lat: 41.9028, lng: 12.4964 }, // Rome
    { lat: 52.52, lng: 13.405 }, // Berlin
    { lat: 59.9139, lng: 10.7522 }, // Oslo
    { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
    { lat: 6.5244, lng: 3.3792 }, // Lagos
    { lat: -1.2921, lng: 36.8219 }, // Nairobi
    { lat: 30.0444, lng: 31.2357 }, // Cairo
    { lat: 25.2048, lng: 55.2708 }, // Dubai
    { lat: 13.7563, lng: 100.5018 }, // Bangkok
    { lat: 3.139, lng: 101.6869 }, // Kuala Lumpur
    { lat: -6.2088, lng: 106.8456 }, // Jakarta
    { lat: 37.5665, lng: 126.978 }, // Seoul
    { lat: 39.9042, lng: 116.4074 }, // Beijing
    { lat: 22.3193, lng: 114.1694 }, // Hong Kong
    { lat: 45.4215, lng: -75.6972 }, // Ottawa
    { lat: 43.6532, lng: -79.3832 }, // Toronto
    { lat: 47.6062, lng: -122.332 }, // Seattle
    { lat: 34.0522, lng: -118.244 }, // Los Angeles
    { lat: 41.8781, lng: -87.6298 }, // Chicago
    { lat: 29.7604, lng: -95.3698 }, // Houston
    { lat: 25.7617, lng: -80.1918 }, // Miami
    { lat: 38.9072, lng: -77.0369 }, // Washington DC
    { lat: 37.7749, lng: -122.419 }, // San Francisco
    { lat: -4.4419, lng: 15.2663 }, // Kinshasa
    { lat: 5.3599, lng: -4.0083 }, // Abidjan
    { lat: 14.6937, lng: -17.4441 }, // Dakar
    { lat: -25.9655, lng: 32.5832 }, // Maputo
    { lat: 33.5731, lng: -7.5898 }, // Casablanca
];

// ── World data (lng/lat arrays for 3D projection) ──────────────────────────────
interface WorldData {
    landRings: [number, number][][]; // arrays of [lng, lat]
    borderArcs: [number, number][][];
}

// ── New: decode topojson to lng/lat arrays for 3-D globe rendering ─────────────
async function fetchWorldData(): Promise<WorldData> {
    try {
        const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        if (!res.ok) return { landRings: [], borderArcs: [] };
        const topo = await res.json();
        const { scale, translate } = topo.transform as {
            scale: [number, number]; translate: [number, number];
        };

        function decodeArc(idx: number): [number, number][] {
            const rev = idx < 0;
            const arc = topo.arcs[rev ? ~idx : idx] as number[][];
            let qx = 0, qy = 0;
            const pts: [number, number][] = arc.map(([dx, dy]: number[]) => {
                qx += dx; qy += dy;
                return [qx * scale[0] + translate[0], qy * scale[1] + translate[1]];
            });
            return rev ? pts.reverse() : pts;
        }

        function decodeRing(indices: number[]): [number, number][] {
            const pts: [number, number][] = [];
            for (const idx of indices) {
                const ap = decodeArc(idx);
                pts.push(...(pts.length > 0 ? ap.slice(1) : ap));
            }
            return pts;
        }

        function extractRings(geom: any): [number, number][][] {
            const rings: [number, number][][] = [];
            if (geom.type === "Polygon") {
                for (const r of geom.arcs) rings.push(decodeRing(r));
            } else if (geom.type === "MultiPolygon") {
                for (const poly of geom.arcs)
                    for (const r of poly) rings.push(decodeRing(r));
            } else if (geom.type === "GeometryCollection") {
                for (const g of geom.geometries) rings.push(...extractRings(g));
            }
            return rings;
        }

        const landRings = extractRings(topo.objects.land);
        const borderArcs: [number, number][][] = (topo.arcs as number[][][]).map(arc => {
            let qx = 0, qy = 0;
            return arc.map(([dx, dy]) => {
                qx += dx; qy += dy;
                return [qx * scale[0] + translate[0], qy * scale[1] + translate[1]] as [number, number];
            });
        });

        return { landRings, borderArcs };
    } catch {
        return { landRings: [], borderArcs: [] };
    }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Home() {
    const [isDark, setIsDark] = useState(false);
    const [dotColors, setDotColors] = useState<string[]>(() =>
        RANDOM_DOTS.map(() => "emerald")
    );

    // Canvas + animation refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const worldDataRef = useRef<WorldData>({ landRings: [], borderArcs: [] });
    const rotRef = useRef(0);           // radians, longitude rotation
    const tiltRef = useRef(22 * (Math.PI / 180)); // radians, camera latitude tilt
    const zoomRef = useRef(0);           // 0 = zoomed in (horizon), 1 = zoomed out (full)
    const velocityRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const lastTimeRef = useRef(0);
    const animFrameRef = useRef(0);

    const [scrollProgress, setScrollProgress] = useState(0);

    // Mutable mirrors of React state (read inside rAF without stale closures)
    const dotColorsRef = useRef<string[]>(dotColors);
    const isDarkRef = useRef(false);

    // Independent per-dot flip timing
    const flipTimesRef = useRef<number[]>([]);

    // ── Dark mode observer (existing pattern) ────────────────────────────────
    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains("dark"));
        const observer = new MutationObserver(() =>
            setIsDark(el.classList.contains("dark"))
        );
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    // Sync mutable refs
    useEffect(() => { dotColorsRef.current = dotColors; }, [dotColors]);
    useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

    // ── Dot color init (client-only, avoids hydration mismatch) ─────────────
    useEffect(() => {
        flipTimesRef.current = RANDOM_DOTS.map(() => Date.now() + Math.random() * 2500);
        setDotColors(RANDOM_DOTS.map(() => Math.random() > 0.5 ? "emerald" : "rose"));
    }, []);

    // ── Master dot-flip timer — each dot has its own random 2-6 s interval ──
    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            setDotColors(prev => {
                let changed = false;
                const next = prev.slice();
                for (let i = 0; i < RANDOM_DOTS.length; i++) {
                    if (now >= flipTimesRef.current[i]) {
                        next[i] = Math.random() > 0.5 ? "emerald" : "rose";
                        flipTimesRef.current[i] = now + 2000 + Math.random() * 4000;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 150);
        return () => clearInterval(timer);
    }, []);

    // ── Interaction Handlers ────────────────────────────────────────────────
    const handleScroll = () => {
        const scroll = window.scrollY;
        const viewport = window.innerHeight;
        const progress = Math.min(Math.max(scroll / (viewport * 1.5), 0), 1);
        setScrollProgress(progress);
        zoomRef.current = progress;
    };

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // ── Fetch world data once ────────────────────────────────────────────────
    useEffect(() => {
        fetchWorldData().then(data => { worldDataRef.current = data; });
    }, []);

    // ── Canvas setup + rAF render loop ───────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const prefersReducedMotion =
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        function resize() {
            if (!canvas) return;
            const w = canvas.offsetWidth || window.innerWidth;
            const h = canvas.offsetHeight || window.innerHeight;
            canvas.width = w;
            canvas.height = h;
        }
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        function draw(time: number) {
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const dt = lastTimeRef.current === 0 ? 0 : time - lastTimeRef.current;
            lastTimeRef.current = time;

            if (!isDraggingRef.current) {
                if (!prefersReducedMotion) {
                    rotRef.current += (dt / 1000) * ((2 * Math.PI) / 120);
                }
                rotRef.current += velocityRef.current.x;
                tiltRef.current += velocityRef.current.y;
                velocityRef.current.x *= 0.95;
                velocityRef.current.y *= 0.95;
            }

            const minTilt = -10 * (Math.PI / 180);
            const maxTilt = 60 * (Math.PI / 180);
            if (tiltRef.current < minTilt) tiltRef.current = minTilt;
            if (tiltRef.current > maxTilt) tiltRef.current = maxTilt;

            const W = canvas.width;
            const H = canvas.height;
            const rot = rotRef.current;
            const z = zoomRef.current;

            const R_start = Math.max(W * 0.60, H * 0.72);
            const cy_start = R_start + H * 0.28;
            const R_end = Math.min(W, H) * 0.38;
            const cy_end = H * 0.52;

            const R = R_start * (1 - z) + R_end * z;
            const cx = W / 2;
            const cy = cy_start * (1 - z) + cy_end * z;

            const TILT = tiltRef.current;
            const cosT = Math.cos(TILT);
            const sinT = Math.sin(TILT);

            function project(lng: number, lat: number) {
                const phi = lat * (Math.PI / 180);
                const lam = lng * (Math.PI / 180) + rot;
                const px = Math.cos(phi) * Math.cos(lam);
                const py = Math.sin(phi);
                const pz = Math.cos(phi) * Math.sin(lam);
                const py2 = py * cosT - pz * sinT;
                const pz2 = py * sinT + pz * cosT;
                return { x: cx + R * px, y: cy - R * py2, vis: pz2 > 0 };
            }

            function isMidpointVisible(lng1: number, lat1: number, lng2: number, lat2: number) {
                let midLng = (lng1 + lng2) / 2;
                // Handle antimeridian wrap (-180 to 180)
                if (Math.abs(lng1 - lng2) > 180) {
                    midLng = midLng > 0 ? midLng - 180 : midLng + 180;
                }
                const midLat = (lat1 + lat2) / 2;
                const phi = midLat * (Math.PI / 180);
                const lam = midLng * (Math.PI / 180) + rot;
                const py = Math.sin(phi);
                const pz = Math.cos(phi) * Math.sin(lam);
                const pz2 = py * sinT + pz * cosT;
                return pz2 > 0;
            }

            const dark = isDarkRef.current;
            ctx.fillStyle = dark ? "#000000" : "#0a0f1e";
            ctx.fillRect(0, 0, W, H);

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.clip();

            ctx.fillStyle = dark ? "#050f0a" : "#0f2318";
            ctx.fillRect(0, 0, W, H);

            ctx.beginPath();
            const { landRings, borderArcs } = worldDataRef.current;
            for (const ring of landRings) {
                let drawing = false;
                let lx = 0, ly = 0, lLng = 0, lLat = 0;
                for (const [lng, lat] of ring) {
                    const { x, y, vis } = project(lng, lat);
                    if (vis) {
                        const longSeg = drawing && Math.hypot(x - lx, y - ly) > R * 0.15;
                        const midVis = !longSeg || isMidpointVisible(lLng, lLat, lng, lat);
                        if (!drawing || !midVis) {
                            ctx.moveTo(x, y);
                            drawing = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                        lx = x; ly = y; lLng = lng; lLat = lat;
                    } else {
                        drawing = false;
                    }
                }
            }
            ctx.fillStyle = dark ? "#0d2b1e" : "#1a3a2a";
            ctx.fill();

            ctx.beginPath();
            for (const arc of borderArcs) {
                let started = false;
                let lx = 0, ly = 0, lLng = 0, lLat = 0;
                for (const [lng, lat] of arc) {
                    const { x, y, vis } = project(lng, lat);
                    if (vis) {
                        const longSeg = started && Math.hypot(x - lx, y - ly) > R * 0.15;
                        const midVis = !longSeg || isMidpointVisible(lLng, lLat, lng, lat);
                        if (!started || !midVis) {
                            ctx.moveTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                        lx = x; ly = y; lLng = lng; lLat = lat;
                    } else {
                        started = false;
                    }
                }
            }
            ctx.strokeStyle = "rgba(16,185,129,0.3)";
            ctx.lineWidth = 0.6;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.stroke();

            const limb = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
            limb.addColorStop(0, "rgba(0,0,0,0)");
            limb.addColorStop(0.7, "rgba(0,0,0,0)");
            limb.addColorStop(1, "rgba(0,0,0,0.65)");
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.fillStyle = limb;
            ctx.fill();

            ctx.restore();

            const atm = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.12);
            atm.addColorStop(0, "rgba(16,185,129,0.55)");
            atm.addColorStop(0.35, "rgba(16,185,129,0.20)");
            atm.addColorStop(0.7, "rgba(32,210,150,0.06)");
            atm.addColorStop(1, "rgba(16,185,129,0)");
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
            ctx.fillStyle = atm;
            ctx.fill();

            const colors = dotColorsRef.current;
            ctx.shadowBlur = 9;
            ctx.shadowColor = "#10b981";
            ctx.fillStyle = "#10b981";
            ctx.beginPath();
            for (let i = 0; i < RANDOM_DOTS.length; i++) {
                if (colors[i] === "rose") continue;
                const { x, y, vis } = project(RANDOM_DOTS[i].lng, RANDOM_DOTS[i].lat);
                if (!vis) continue;
                ctx.moveTo(x + 2.5, y);
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            }
            ctx.fill();

            ctx.shadowColor = "#f43f5e";
            ctx.fillStyle = "#f43f5e";
            ctx.beginPath();
            for (let i = 0; i < RANDOM_DOTS.length; i++) {
                if (colors[i] !== "rose") continue;
                const { x, y, vis } = project(RANDOM_DOTS[i].lng, RANDOM_DOTS[i].lat);
                if (!vis) continue;
                ctx.moveTo(x + 2.5, y);
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        function tick(time: number) {
            draw(time);
            animFrameRef.current = requestAnimationFrame(tick);
        }
        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            ro.disconnect();
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        isDraggingRef.current = true;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        lastMouseRef.current = { x: clientX, y: clientY };
        velocityRef.current = { x: 0, y: 0 };
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggingRef.current) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dx = (clientX - lastMouseRef.current.x) * 0.005;
        const dy = (clientY - lastMouseRef.current.y) * 0.005;
        rotRef.current += dx;
        tiltRef.current -= dy;
        velocityRef.current = { x: dx, y: -dy };
        lastMouseRef.current = { x: clientX, y: clientY };
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
    };

    useEffect(() => {
        window.addEventListener("mouseup", handleMouseUp);
        window.addEventListener("touchend", handleMouseUp);
        return () => {
            window.removeEventListener("mouseup", handleMouseUp);
            window.removeEventListener("touchend", handleMouseUp);
        };
    }, []);

    const [pageBg, setPageBg] = useState(isDark ? "#000000" : "#f9fafb");
    useEffect(() => {
        setPageBg(isDark ? "#000000" : "#f9fafb");
    }, [isDark]);

    const headingShadow = {
        textShadow: "0 0 18px rgba(16,185,129,0.4), 0 2px 6px rgba(0,0,0,0.5)",
    };

    const z = scrollProgress;

    return (
        <div className="w-full bg-[#0a0f1e] dark:bg-[#000000] min-h-[300vh] relative">
            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                className="sticky top-0 w-full h-screen flex flex-col items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
                style={{ backgroundColor: isDark ? "#000000" : "#0a0f1e" }}
            >
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    aria-hidden="true"
                />

                <div
                    className="absolute inset-0 pointer-events-none z-[1]"
                    style={{
                        opacity: 1 - z * 0.5,
                        background: [
                            `linear-gradient(to top, ${pageBg} 0%, transparent 40%)`,
                        ].join(", "),
                    }}
                />

                <motion.div
                    style={{
                        opacity: Math.max(0, 1 - z * 2.5),
                        y: z * -100,
                        pointerEvents: z > 0.4 ? "none" : "auto"
                    }}
                    className="w-full flex flex-col items-center space-y-16 z-10 max-w-7xl mx-auto pointer-events-none px-6"
                >
                    <div className="text-center space-y-6 pointer-events-auto">
                        <h1
                            className="text-6xl sm:text-7xl font-black tracking-tighter text-white"
                            style={headingShadow}
                        >
                            Still<span className="text-emerald-400">Open</span>
                        </h1>
                        <p className="text-xl sm:text-2xl text-gray-300 font-light max-w-xl mx-auto leading-relaxed">
                            Open or Closed prediction model powered by{" "}
                            <span className="font-semibold text-gray-100">open source data!</span>
                        </p>
                    </div>

                    <div className="w-full flex justify-center pointer-events-auto">
                        <SearchBar />
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 - z * 5 }}
                    className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400 z-10"
                >
                    <span className="text-[10px] uppercase font-bold tracking-[0.2em]">Scroll to Explore</span>
                    <div className="w-px h-12 bg-gradient-to-b from-emerald-500 to-transparent" />
                </motion.div>
            </div>

            <div className="relative z-20 w-full flex flex-col items-center">
                <div className="h-[100vh]" />
                <section className="w-full max-w-7xl mx-auto px-6 py-32 grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                    <div className="space-y-8">
                        <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
                            A Global Perspective on <br />
                            <span className="text-emerald-400">Real-Time Data</span>
                        </h2>
                        <p className="text-gray-400 text-lg leading-relaxed">
                            Our model processes millions of signals from open-source repositories,
                            Overture Maps components, and community data points to predict
                            the operational status of businesses worldwide.
                        </p>
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <div className="text-3xl font-black text-emerald-400">240M+</div>
                                <div className="text-xs uppercase tracking-tighter text-gray-500 font-bold">Places Monitored</div>
                            </div>
                            <div>
                                <div className="text-3xl font-black text-emerald-400">92%</div>
                                <div className="text-xs uppercase tracking-tighter text-gray-500 font-bold">Model Accuracy</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                        <div className="space-y-6">
                            <div className="h-2 w-24 bg-emerald-500 rounded-full" />
                            <h3 className="text-xl font-bold text-white">Advanced Signal Analysis</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                We analyze historical patterns, social markers, and direct telemetry
                                to determine if a place is open, even when official sources are
                                silent or outdated.
                            </p>
                            <div className="space-y-3 pt-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">{i}</div>
                                        <div className="h-2 flex-1 bg-white/10 rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} whileInView={{ width: '70%' }} className="h-full bg-emerald-500/40" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
