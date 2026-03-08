from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import json
import requests
from sqlalchemy import text

from .models import SearchResult, PlaceDetail
from .search import search_places, get_place_record, load_data_to_db
from .database import engine, Base, IS_POSTGRES

app = FastAPI(title="StillOpen API")

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    load_data_to_db()

@app.get("/geocode/city")
def geocode_city_endpoint(city: str):
    """
    Geocode a city name using a local cache and Nominatim fallback.
    """
    print(f"DEBUG: Received geocode request for city: {city}")
    with engine.connect() as conn:
        try:
            # 1. Check Cache
            query = text("SELECT display_name, bbox, boundary FROM city_cache WHERE LOWER(name) = LOWER(:name)")
            row = conn.execute(query, {"name": city}).fetchone()
            if row:
                print(f"DEBUG: Cache hit for city: {city}")
                return {
                    "displayName": row.display_name,
                    "bbox": row.bbox,
                    "boundary": row.boundary
                }

            # 2. Fetch from Nominatim
            print(f"DEBUG: Cache miss for {city} - attempting live fetch.")
            res = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": city,
                    "format": "json",
                    "limit": 5,
                    "polygon_geojson": 1,
                    "countrycodes": "us"
                },
                headers={"User-Agent": "StillOpenBackend/1.0"},
                timeout=10
            )
            
            if res.status_code == 429:
                print(f"ERROR: Nominatim rate limit hit (429) for city: {city}")
                raise HTTPException(status_code=429, detail="Geocoding service throttled. Please try again later.")
            
            if res.status_code != 200:
                print(f"ERROR: Nominatim returned status {res.status_code} for city: {city}")
                raise HTTPException(status_code=res.status_code, detail="Geocoding service error")

            data = res.json()
            if not data:
                print(f"DEBUG: No results found for city: {city}")
                return None

            # Logic to pick best result (same as frontend)
            boundaries = [r for r in data if r.get('class') == 'boundary']
            boundaries.sort(key=lambda x: float(x.get('importance') or 0), reverse=True)
            first = boundaries[0] if boundaries else data[0]
            
            bbox_arr = first.get('boundingbox', [])
            result = {
                "displayName": first.get('display_name'),
                "boundary": first.get('geojson'),
                "bbox": {
                    "min_lat": float(bbox_arr[0]),
                    "max_lat": float(bbox_arr[1]),
                    "min_lon": float(bbox_arr[2]),
                    "max_lon": float(bbox_arr[3]),
                }
            }

            # 3. Save to Cache
            with engine.begin() as save_conn:
                save_conn.execute(
                    text("INSERT INTO city_cache (name, display_name, bbox, boundary) VALUES (:name, :dname, :bbox, :boundary) ON CONFLICT (name) DO NOTHING"),
                    {
                        "name": city,
                        "dname": result["displayName"],
                        "bbox": json.dumps(result["bbox"]),
                        "boundary": json.dumps(result["boundary"])
                    }
                )

            print(f"DEBUG: Successfully fetched and cached city: {city}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            print(f"ERROR: Geocoding exception for {city}: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/search", response_model=List[SearchResult])
def search(q: str = "", city: str = None, limit: int = 20, offset: int = 0,
           min_lat: float = None, max_lat: float = None,
           min_lon: float = None, max_lon: float = None):
    print(f"DEBUG: Search request - q: '{q}', city: '{city}', bbox: [{min_lat}, {max_lat}, {min_lon}, {max_lon}]")
    return search_places(query=q, city=city, limit=limit, offset=offset,
                         min_lat=min_lat, max_lat=max_lat,
                         min_lon=min_lon, max_lon=max_lon)

@app.get("/place/{place_id}", response_model=PlaceDetail)
def get_place_details(place_id: str):
    record = get_place_record(place_id)
    if not record:
        raise HTTPException(status_code=404, detail="Place not found")

    # get_place_record already runs predict_status inside _extract_place_info.
    # We only need to attach the explanation list for the detail view.
    from .predict import predict_status
    meta = record.get("metadata_json", {})
    raw = meta.get("raw", meta) if isinstance(meta, dict) else {}
    prediction = predict_status(raw)

    return {
        **record,
        "explanation": prediction.get("explanation", []),
    }
