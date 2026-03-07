"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import type { SearchResultType } from "./SearchResults";
import type { GeoJsonObject } from "geojson";

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

interface CityMapProps {
    results: SearchResultType[];
    center?: [number, number];
    boundary?: object | null;
    darkMode?: boolean;
}

export default function CityMap({ results, center, boundary, darkMode = false }: CityMapProps) {
    const defaultCenter: [number, number] = center || [36.97, -122.03]; // Santa Cruz fallback

    const validResults = useMemo(() => results.filter((r) => r.lat && r.lon), [results]);

    const mapCenter: [number, number] = useMemo(() => {
        if (center) return center;
        if (validResults.length > 0) return [validResults[0].lat!, validResults[0].lon!];
        return defaultCenter;
    }, [center, validResults, defaultCenter]);

    const mapZoom = center ? 12 : validResults.length > 0 ? 12 : 6;

    // Switch tile layer based on dark mode
    const tileUrl = darkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    // Derive a stable key from the boundary to force GeoJSON layer remount on city change
    const boundaryKey = boundary
        ? `boundary-${JSON.stringify(boundary).slice(0, 60)}`
        : "no-boundary";

    return (
        <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom
            className="w-full h-full z-0"
            style={{ background: darkMode ? "#1a1a2e" : "#f8fafb" }}
        >
            <TileLayer
                key={tileUrl}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
                url={tileUrl}
            />
            <MapUpdater center={mapCenter} zoom={mapZoom} />

            {/* City boundary polygon drawn as a dashed green outline */}
            {boundary && (
                <GeoJSON
                    key={boundaryKey}
                    data={boundary as GeoJsonObject}
                    style={() => ({
                        color: "#10b981",
                        weight: 2.5,
                        opacity: 0.85,
                        fillColor: "#10b981",
                        fillOpacity: 0.05,
                        dashArray: "6 4",
                    })}
                />
            )}

            {validResults.map((res, i) => {
                const isOpen = res.status?.toLowerCase() === "open";
                const isClosed = res.status?.toLowerCase() === "closed";
                // Green/black/white theme: open=emerald, closed=near-black (light) or white (dark), unknown=gray
                const color = isOpen
                    ? "#10b981"
                    : isClosed
                    ? darkMode ? "#f3f4f6" : "#111827"
                    : "#6b7280";

                return (
                    <CircleMarker
                        key={`${res.id}-${i}`}
                        center={[res.lat!, res.lon!]}
                        radius={7}
                        pathOptions={{
                            fillColor: color,
                            fillOpacity: 0.9,
                            color: darkMode ? "#374151" : "#fff",
                            weight: 2,
                        }}
                    >
                        <Popup minWidth={200}>
                            <div className="font-sans text-sm space-y-1.5 p-1">
                                <h3 className="font-bold text-gray-900 leading-tight text-base">
                                    {res.name || "Unknown"}
                                </h3>
                                <p className={`text-xs font-bold uppercase tracking-wider ${isOpen ? "text-emerald-600" : isClosed ? "text-gray-800" : "text-gray-500"}`}>
                                    {res.status} &middot; {((res.confidence ?? 0) * 100).toFixed(0)}% confidence
                                </p>
                                {res.address && (
                                    <p className="text-xs text-gray-500">{res.address}</p>
                                )}
                                {res.category && (
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{res.category}</p>
                                )}
                                <Link
                                    href={`/place/${res.id}`}
                                    className="inline-block mt-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                >
                                    View details &rarr;
                                </Link>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
