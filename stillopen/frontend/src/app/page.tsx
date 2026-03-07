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

// ── Existing topojson arc decoder — kept as-is per instructions ────────────────
// (returns SVG path string; kept for reference — globe uses fetchWorldData below)
async function fetchWorldMapPath(): Promise<string> {
    try {
        const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        if (!res.ok) return "";
        const topo = await res.json();
        const { scale, translate } = topo.transform as {
            scale: [number, number]; translate: [number, number];
        };
        const segments: string[] = [];
        for (const arc of topo.arcs as number[][][]) {
            let qx = 0, qy = 0;
            const pts: string[] = [];
            for (const [dx, dy] of arc) {
                qx += dx; qy += dy;
                const lng = qx * scale[0] + translate[0];
                const lat = qy * scale[1] + translate[1];
                const x = ((lng + 180) / 360) * 960;
                const y = ((90 - lat) / 180) * 500;
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            }
            if (pts.length >= 2)
                segments.push(`M${pts[0]}` + pts.slice(1).map(p => `L${p}`).join(""));
        }
        return segments.join(" ");
    } catch { return ""; }
}

// ── New: decode topojson to lng/lat arrays for 3-D globe rendering ─────────────
// Uses the same delta-decode logic as fetchWorldMapPath, different output format.
async function fetchWorldData(): Promise<WorldData> {
    try {
        const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        if (!res.ok) return { landRings: [], borderArcs: [] };
        const topo = await res.json();
        const { scale, translate } = topo.transform as {
            scale: [number, number]; translate: [number, number];
        };

        // Delta-decode one arc to [lng, lat] pairs (same logic as fetchWorldMapPath)
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

        // Merge arc list into a single continuous ring (skip duplicate shared endpoints)
        function decodeRing(indices: number[]): [number, number][] {
            const pts: [number, number][] = [];
            for (const idx of indices) {
                const ap = decodeArc(idx);
                pts.push(...(pts.length > 0 ? ap.slice(1) : ap));
            }
            return pts;
        }

        // Recursively extract polygon rings from any geometry type
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

        // All raw arcs as border polylines
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
    const velocityRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const lastTimeRef = useRef(0);
    const animFrameRef = useRef(0);

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

        // Size canvas to physical pixels
        function resize() {
            const w = canvas.offsetWidth || window.innerWidth;
            const h = canvas.offsetHeight || window.innerHeight;
            canvas.width = w;
            canvas.height = h;
        }
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        // ── Main draw function ──────────────────────────────────────────────
        function draw(time: number) {
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Advance rotation with ease-out momentum
            const dt = lastTimeRef.current === 0 ? 0 : time - lastTimeRef.current;
            lastTimeRef.current = time;

            if (!isDraggingRef.current) {
                // Natural rotation + friction for momentum
                if (!prefersReducedMotion) {
                    rotRef.current += (dt / 1000) * ((2 * Math.PI) / 120); // slow baseline
                }
                rotRef.current += velocityRef.current.x;
                tiltRef.current += velocityRef.current.y;

                // Friction
                velocityRef.current.x *= 0.95;
                velocityRef.current.y *= 0.95;
            }

            const W = canvas.width;
            const H = canvas.height;
            const rot = rotRef.current;

            // Constrain tilt to avoid gimbal lock or extreme inversion
            const minTilt = -10 * (Math.PI / 180);
            const maxTilt = 60 * (Math.PI / 180);
            if (tiltRef.current < minTilt) tiltRef.current = minTilt;
            if (tiltRef.current > maxTilt) tiltRef.current = maxTilt;

            const TILT = tiltRef.current;
            const cosT = Math.cos(TILT);
            const sinT = Math.sin(TILT);

            // Globe geometry:
            // – R large enough to fill viewport width and overflow the bottom
            // – Centre well below viewport so only the top arc (horizon) peeks in
            const R = Math.max(W * 0.60, H * 0.72);
            const cx = W / 2;
            const cy = R + H * 0.28; // horizon sits ~28 % from top

            // ── Orthographic projection ─────────────────────────────────────
            // Returns canvas {x, y} and whether the point faces the camera (vis).
            // Visible hemisphere: z-component after tilt > 0.
            function project(lng: number, lat: number) {
                const phi = lat * (Math.PI / 180);
                const lam = lng * (Math.PI / 180) + rot;
                // Unit-sphere point
                const px = Math.cos(phi) * Math.cos(lam);
                const py = Math.sin(phi);
                const pz = Math.cos(phi) * Math.sin(lam);
                // Apply X-axis tilt
                const py2 = py * cosT - pz * sinT;
                const pz2 = py * sinT + pz * cosT;
                return { x: cx + R * px, y: cy - R * py2, vis: pz2 > 0 };
            }

            const dark = isDarkRef.current;

            // ── 1. Space background above the horizon ───────────────────────
            ctx.fillStyle = dark ? "#000000" : "#0a0f1e";
            ctx.fillRect(0, 0, W, H);

            // ── 2. Globe disc: clip → ocean fill ────────────────────────────
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.clip();

            ctx.fillStyle = dark ? "#050f0a" : "#0f2318";
            ctx.fillRect(0, 0, W, H);

            // ── 3. Land fill (batched into one path for performance) ─────────
            // Only draw consecutive visible vertices; break path on invisible ones
            // to prevent back-face geometry bleeding into the front hemisphere.
            ctx.beginPath();
            const { landRings, borderArcs } = worldDataRef.current;
            for (const ring of landRings) {
                let drawing = false;
                for (const [lng, lat] of ring) {
                    const { x, y, vis } = project(lng, lat);
                    if (vis) {
                        if (!drawing) { ctx.moveTo(x, y); drawing = true; }
                        else { ctx.lineTo(x, y); }
                    } else {
                        drawing = false;
                    }
                }
            }
            ctx.fillStyle = dark ? "#0d2b1e" : "#1a3a2a";
            ctx.fill();

            // ── 4. Country borders (batched single stroke) ───────────────────
            ctx.beginPath();
            for (const arc of borderArcs) {
                let started = false;
                for (const [lng, lat] of arc) {
                    const { x, y, vis } = project(lng, lat);
                    if (vis) {
                        if (!started) { ctx.moveTo(x, y); started = true; }
                        else { ctx.lineTo(x, y); }
                    } else {
                        started = false;
                    }
                }
            }
            ctx.strokeStyle = "rgba(16,185,129,0.3)";
            ctx.lineWidth = 0.6;
            ctx.lineJoin = "round";
            ctx.stroke();

            // ── 5. Limb darkening — planet edges feel rounded ────────────────
            const limb = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
            limb.addColorStop(0, "rgba(0,0,0,0)");
            limb.addColorStop(0.7, "rgba(0,0,0,0)");
            limb.addColorStop(1, "rgba(0,0,0,0.65)");
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.fillStyle = limb;
            ctx.fill();

            ctx.restore(); // ── end globe clip ──────────────────────────────

            // ── 6. Atmosphere glow — emerald/teal halo hugging the horizon ──
            // createRadialGradient(inner circle … outer circle): opacity peaks at
            // the disc edge (R * 0.97) and fades to zero just outside (R * 1.12).
            const atm = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.12);
            atm.addColorStop(0, "rgba(16,185,129,0.55)");
            atm.addColorStop(0.35, "rgba(16,185,129,0.20)");
            atm.addColorStop(0.7, "rgba(32,210,150,0.06)");
            atm.addColorStop(1, "rgba(16,185,129,0)");
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
            ctx.fillStyle = atm;
            ctx.fill();

            // ── 7. City-light dots — emerald (open) / rose (closed) ─────────
            const colors = dotColorsRef.current;

            // Emerald pass
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

            // Rose pass
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

        // rAF loop
        function tick(time: number) {
            draw(time);
            animFrameRef.current = requestAnimationFrame(tick);
        }
        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            ro.disconnect();
        };
    }, []); // intentionally empty — all live state accessed via refs

    // ── Interaction Handlers ────────────────────────────────────────────────
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

    // ── Render ───────────────────────────────────────────────────────────────
    const [pageBg, setPageBg] = useState(isDark ? "#000000" : "#f9fafb");
    useEffect(() => {
        setPageBg(isDark ? "#000000" : "#f9fafb");
    }, [isDark]);

    const headingShadow = {
        textShadow: "0 0 18px rgba(16,185,129,0.4), 0 2px 6px rgba(0,0,0,0.5)",
    };

    return (
        <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            className="w-full flex-1 flex flex-col items-center justify-center relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{ backgroundColor: isDark ? "#000000" : "#0a0f1e" }}
        >
            {/* Globe canvas — fills the container absolutely */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
            />

            {/* Bottom gradient: page background bleeds up ~45 % so the search
                bar sits on a clean, readable surface rather than raw globe */}
            <div
                className="absolute inset-0 pointer-events-none z-[1]"
                style={{
                    background: [
                        `linear-gradient(to top, ${pageBg} 0%, ${pageBg} 18%, transparent 52%)`,
                    ].join(", "),
                }}
            />

            {/* Foreground UI */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
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
        </div>
    );
}
