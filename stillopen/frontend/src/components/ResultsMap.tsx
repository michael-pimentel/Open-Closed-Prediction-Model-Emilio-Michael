"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import { MapPin, Clock, Globe, Phone } from "lucide-react";
import type { SearchResultType } from "./SearchResults";
import type { GeoJsonObject } from "geojson";

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

interface ResultsMapProps {
    results: SearchResultType[];
    boundary?: object | null;
}

export default function ResultsMap({ results, boundary }: ResultsMapProps) {
    const defaultCenter: [number, number] = [36.7783, -119.4179]; // California fallback
    const [isDark, setIsDark] = useState(false);

    // Observe dark mode class changes on <html>
    useEffect(() => {
        const el = document.documentElement;
        setIsDark(el.classList.contains("dark"));
        const observer = new MutationObserver(() => {
            setIsDark(el.classList.contains("dark"));
        });
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const validResults = results.filter((r) => r.lat && r.lon);

    if (!validResults.length) {
        return (
            <MapContainer center={defaultCenter} zoom={6} scrollWheelZoom className="w-full h-full rounded-2xl z-0">
                <TileLayer
                    key={tileUrl}
                    attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                    url={tileUrl}
                />
            </MapContainer>
        );
    }

    const first = validResults[0];
    const center: [number, number] = [first.lat as number, first.lon as number];

    const boundaryKey = boundary
        ? `boundary-${JSON.stringify(boundary).slice(0, 60)}`
        : "no-boundary";

    return (
        <MapContainer center={center} zoom={13} scrollWheelZoom className="w-full h-full rounded-2xl z-0">
            <TileLayer
                key={tileUrl}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url={tileUrl}
            />
            <MapUpdater center={center} zoom={13} />

            {boundary && (
                <GeoJSON
                    key={boundaryKey}
                    data={boundary as GeoJsonObject}
                    style={() => ({
                        color: "#10b981",
                        weight: 2,
                        opacity: 1,
                        fillColor: "#10b981",
                        fillOpacity: 0.08,
                    })}
                />
            )}

            {validResults.map((res) => {
                const isOpen = res.status?.toLowerCase() === "open";
                const isClosed = res.status?.toLowerCase() === "closed";
                // Green/black/white theme: open=emerald, closed=near-black (light) or white (dark)
                const color = isOpen
                    ? "#10b981"
                    : isClosed
                    ? "#f43f5e"
                    : "#6b7280";

                return (
                    <CircleMarker
                        key={res.id}
                        center={[res.lat as number, res.lon as number]}
                        radius={8}
                        pathOptions={{
                            fillColor: color,
                            fillOpacity: 0.9,
                            color: isDark ? "#374151" : "#fff",
                            weight: 2,
                        }}
                    >
                        <Popup className="rounded-xl overflow-hidden p-0" minWidth={220}>
                            <div className="flex flex-col font-sans text-sm">
                                {/* Photo — only if real URL */}
                                {res.photo_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={res.photo_url}
                                        alt={res.name}
                                        className="w-full h-28 object-cover"
                                    />
                                )}

                                <div className="p-3 space-y-2 min-h-[120px]">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-gray-900 leading-tight">{res.name || "Unknown Place"}</h3>
                                        <StatusBadge status={res.status} />
                                    </div>

                                    {res.category && (
                                        <span className="inline-block text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                            {res.category}
                                        </span>
                                    )}

                                    <p className="flex items-start gap-1.5 text-gray-600">
                                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                                        {res.address ? (
                                            <span className="text-xs leading-snug">{res.address}</span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">
                                                {res.lat && res.lon ? `Coords: ${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}` : "No address provided"}
                                            </span>
                                        )}
                                    </p>

                                    {res.opening_hours && (
                                        <p className="flex items-center gap-1.5 text-gray-600">
                                            <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                            <span className="text-xs">{res.opening_hours}</span>
                                        </p>
                                    )}

                                    {res.phone && (
                                        <p className="flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                            <a href={`tel:${res.phone}`} className="text-xs text-blue-500 hover:underline">
                                                {res.phone}
                                            </a>
                                        </p>
                                    )}

                                    {res.website && (
                                        <p className="flex items-center gap-1.5">
                                            <Globe className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                            <a
                                                href={res.website}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-blue-500 hover:underline truncate max-w-[150px]"
                                            >
                                                {res.website.replace(/^https?:\/\//, "")}
                                            </a>
                                        </p>
                                    )}

                                    <div className="pt-1 border-t border-gray-100">
                                        <Link
                                            href={`/place/${res.id}`}
                                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                        >
                                            View details &rarr;
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
