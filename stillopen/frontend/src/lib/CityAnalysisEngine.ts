import { geocodeCity, searchPlacesByBbox } from './CitySearchService';
import { useCityStore } from '../store/CityResultsStore';

// Ray-casting point-in-polygon. GeoJSON coords are [lon, lat].
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function pointInGeoJSON(lat: number, lon: number, geojson: object): boolean {
    const g = geojson as { type: string; coordinates: unknown };
    if (g.type === 'Polygon') {
        return pointInRing(lon, lat, (g.coordinates as number[][][])[0]);
    }
    if (g.type === 'MultiPolygon') {
        return (g.coordinates as number[][][][]).some(poly => pointInRing(lon, lat, poly[0]));
    }
    return true;
}

export class CityAnalysisEngine {
    private isCancelled = false;
    private analysisId = 0; // Incremented per run to prevent stale async callbacks
    private maxResultsToProcess = 500; // Cap to prevent crashing browser or backend easily
    private batchSize = 50;

    public cancel() {
        this.isCancelled = true;
    }

    public async runAnalysis(cityName: string) {
        this.isCancelled = false;
        const currentId = ++this.analysisId;
        const store = useCityStore.getState();

        try {
            store.startAnalysis(cityName);

            // 1. Geocode the city to a bounding box and fetch boundary polygon
            const geoResult = await geocodeCity(cityName);
            if (!geoResult) {
                if (this.analysisId === currentId) {
                    store.setError(`Could not find city bounds for "${cityName}".`);
                }
                return;
            }

            // Bail out if a newer analysis has started or we were cancelled
            if (this.analysisId !== currentId || this.isCancelled) return;

            console.log(`Starting analysis for ${geoResult.displayName}`, geoResult.bbox);

            // Store the city boundary polygon so the map can draw it
            store.setCityBoundary(geoResult.boundary);

            // 2. Paginate through results within the bounding box
            let offset = 0;
            let totalFetched = 0;
            let hasMore = true;

            while (hasMore && !this.isCancelled && this.analysisId === currentId && totalFetched < this.maxResultsToProcess) {
                // The backend search route already runs predict_status internally and returns 'status' and 'confidence'.
                // All we need to do is paginate through the bbox.
                const batch = await searchPlacesByBbox(geoResult.bbox, this.batchSize, offset);

                if (this.analysisId !== currentId || this.isCancelled) break;

                if (batch.length === 0) {
                    hasMore = false;
                    break;
                }

                // Filter to places actually inside the city boundary polygon (not just the bbox rectangle)
                const withinCity = geoResult.boundary
                    ? batch.filter((r: { lat?: number; lon?: number }) =>
                        r.lat != null && r.lon != null
                            ? pointInGeoJSON(r.lat, r.lon, geoResult.boundary as object)
                            : true
                    )
                    : batch;

                if (withinCity.length > 0) store.addResults(withinCity);
                totalFetched += batch.length; // use raw count to advance pagination
                offset += this.batchSize;

                // Update rough progress. (Without knowing total hits upfront, we estimate out of maxResultsToProcess)
                const pct = Math.min(99, Math.round((totalFetched / this.maxResultsToProcess) * 100));
                store.setProgress(pct);

                // Small delay to let React render the batch and not overheat the backend
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!this.isCancelled && this.analysisId === currentId) {
                store.finishAnalysis();
            }

        } catch (err: unknown) {
            console.error("CityAnalysisEngine error:", err);
            if (this.analysisId === currentId) {
                store.setError(err instanceof Error ? err.message : "An unknown error occurred during analysis.");
            }
        }
    }
}

// Singleton helper
export const cityAnalysisEngine = new CityAnalysisEngine();
