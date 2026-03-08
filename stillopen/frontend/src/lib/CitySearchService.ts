export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface BoundingBox {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
}

// Common city aliases / typo corrections so users don't get a blank result.
// Keys are lowercased; values are the canonical geocodeable string.
const CITY_ALIASES: Record<string, string> = {
    "sf": "San Francisco, CA",
    "san fransisco": "San Francisco, CA",
    "san francisco": "San Francisco, CA",
    "la": "Los Angeles, CA",
    "los angelas": "Los Angeles, CA",
    "nyc": "New York City, NY",
    "new york": "New York City, NY",
    "santa cruz": "Santa Cruz, CA",
    "san jose": "San Jose, CA",
    "san josé": "San Jose, CA",
    "sacremento": "Sacramento, CA",
    "sacramento": "Sacramento, CA",
    "las vegas": "Las Vegas, NV",
    "vegas": "Las Vegas, NV",
    "chicago": "Chicago, IL",
    "reno": "Reno, NV",
    "fresno": "Fresno, CA",
    "stockton": "Stockton, CA",
    "modesto": "Modesto, CA",
    "oakland": "Oakland, CA",
    "berkeley": "Berkeley, CA",
    "santa barbara": "Santa Barbara, CA",
    "santa rosa": "Santa Rosa, CA",
};

function resolveAlias(cityName: string): string {
    const lower = cityName.trim().toLowerCase();
    return CITY_ALIASES[lower] ?? cityName;
}

export async function geocodeCity(cityName: string): Promise<{ bbox: BoundingBox; displayName: string; boundary: object | null } | null> {
    try {
        const resolvedName = resolveAlias(cityName);

        // 1. Try our backend cache first (avoids OSM rate limits)
        try {
            const backendUrl = `${API_BASE}/geocode/city?city=${encodeURIComponent(resolvedName)}`;
            const backendRes = await fetch(backendUrl);
            if (backendRes.status === 429) {
                throw new Error("THROTTLED");
            }
            if (backendRes.ok) {
                const cached = await backendRes.json();
                if (cached) return cached;
            }
        } catch (err: any) {
            if (err.message === "THROTTLED") throw err;
            console.warn("Backend geocode error, skipping cache:", err);
        }

        // 2. Fallback to direct Nominatim search
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(resolvedName)}&format=json&limit=5&polygon_geojson=1&countrycodes=us`;
        const res = await fetch(url, { headers: { 'User-Agent': 'StillOpenCitiesMode/1.0' } });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data || data.length === 0) return null;

        // Among boundary results, pick the one with the highest Nominatim importance score.
        // This ensures "San Francisco" resolves to the SF city/county (high importance) rather
        // than a county MSA or a smaller place with the same name. Falls back to first result
        // if no boundary is found.
        type NomResult = { class: string; importance?: number | string; boundingbox: string[]; display_name: string; geojson?: object };
        const boundaries = (data as NomResult[]).filter(r => r.class === 'boundary');
        boundaries.sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0));
        const firstResult = boundaries[0] ?? data[0];
        // Nominatim returns boundingbox as [SouthLat, NorthLat, WestLon, EastLon] strings
        const bboxArr = firstResult.boundingbox;

        return {
            displayName: firstResult.display_name,
            boundary: firstResult.geojson || null,
            bbox: {
                min_lat: parseFloat(bboxArr[0]),
                max_lat: parseFloat(bboxArr[1]),
                min_lon: parseFloat(bboxArr[2]),
                max_lon: parseFloat(bboxArr[3]),
            }
        };
    } catch (e) {
        console.error("Failed to geocode city:", e);
        return null;
    }
}

export async function searchPlacesByBbox(bbox: BoundingBox, limit = 50, offset = 0) {
    let url = `${API_BASE}/search?q=&limit=${limit}&offset=${offset}`;
    url += `&min_lat=${bbox.min_lat}&max_lat=${bbox.max_lat}&min_lon=${bbox.min_lon}&max_lon=${bbox.max_lon}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to search places by bounding box");
    return res.json();
}
