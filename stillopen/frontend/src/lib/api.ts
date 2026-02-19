export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function searchPlaces(query: string) {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Failed to search places");
    return res.json();
}

export async function getPlaceDetails(id: string) {
    const res = await fetch(`${API_BASE}/place/${id}`);
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to get place details");
    }
    return res.json();
}
