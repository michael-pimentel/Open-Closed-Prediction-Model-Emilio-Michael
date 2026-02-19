import json
from sqlalchemy import text
from .database import get_db, engine
from .predict import predict_place

def load_data_to_db():
    pass
    # No-op for Postgres migration, data is now ingested via `osm2pgsql` or Overture scripts offline.

def search_places(query: str, limit: int = 20):
    """
    Search places utilizing Postgres trigram indexes (pg_trgm) for fuzzy matching.
    Optionally, you can extend this SQL to also parse bounds to run PostGIS ST_Intersects,
    or ST_DWithin for 'Near Me' functionalities.
    """
    if not query or len(query.strip()) < 2:
        return []

    # Using robust connection pooling directly
    with engine.connect() as conn:
        try:
            # We are querying the core `places` table populated by PostGIS. 
            # We sort descending by the similarity threshold, heavily penalizing misses.
            sql = text("""
                SELECT 
                    place_id, 
                    name, 
                    ST_X(geom::geometry) AS lon, 
                    ST_Y(geom::geometry) AS lat, 
                    metadata_json,
                    similarity(name, :query_str) as name_sim
                FROM places 
                WHERE 
                    name ILIKE :ilike_query 
                    OR similarity(name, :query_str) > 0.15
                ORDER BY name_sim DESC 
                LIMIT :limit;
            """)
            
            # Param binding handles sql injection risks
            results = conn.execute(sql, {
                "ilike_query": f"%{query}%",
                "query_str": query,
                "limit": limit
            }).fetchall()
            
            out = []
            for row in results:
                # Map tuple/record back
                place_id = row.place_id
                name = row.name
                lon = row.lon
                lat = row.lat
                metadata = row.metadata_json or {}
                
                # We can perform a lightweight status prediction during the dropdown preview.
                try:
                    pred = predict_place(metadata)
                    status = pred.get('status', 'unknown')
                    confidence = pred.get('confidence', 0.0)
                except Exception:
                    status = 'unknown'
                    confidence = 0.0

                location_str = f"Lon: {lon:.5f}, Lat: {lat:.5f}" if lon else "Unknown Location"
                # If your metadata JSON has the original localized address, prefer it:
                if 'city' in metadata and 'state' in metadata:
                    location_str = f"{metadata.get('city', '')}, {metadata.get('state', '')}".strip(', ')

                out.append({
                    "id": str(place_id),
                    "name": name,
                    "address": location_str,
                    "status": status,
                    "confidence": confidence
                })
            
            return out
        except Exception as e:
            print(f"Error on pg_trgm search: {e}")
            return []

def get_place_metadata(place_id: str):
    """
    Look up strict POI data for the detailed ML view via Indexed PK or place_id.
    """
    with engine.connect() as conn:
        try:
            sql = text("SELECT metadata_json FROM places WHERE place_id = :place_id")
            row = conn.execute(sql, {"place_id": place_id}).fetchone()
            if row and row.metadata_json:
                return row.metadata_json
            return None
        except Exception as e:
            print(f"Postgres Query Error: {e}")
            return None
