import json
import os
import pandas as pd
import numpy as np
from sqlalchemy import text, insert
from .database import engine, Base, IS_POSTGRES
from .models import Place
from .predict import predict_place


# =============================================================================
# DATA SEEDING
# =============================================================================

def load_data_to_db():
    """
    Seeds the database on startup.
    - PostgreSQL: No-op (data is ingested via osm2pgsql or Overture scripts offline)
    - SQLite: Auto-seeds from the parquet dataset if the DB is empty
    """
    if IS_POSTGRES:
        print("PostgreSQL mode: Skipping auto-seed. Data should be ingested via osm2pgsql or scripts.")
        return

    # SQLite mode: create tables and seed from parquet
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM places")).fetchone()
        if result[0] > 0:
            print(f"Database already seeded with {result[0]} records. Skipping.")
            return

    # Locate parquet data
    data_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "project_c_samples.parquet")
    data_path = os.path.normpath(data_path)

    if not os.path.exists(data_path):
        data_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "project_c_samples.parquet")
        data_path = os.path.normpath(data_path)

    if not os.path.exists(data_path):
        print(f"Warning: Parquet data not found at {data_path}. Database will be empty.")
        return

    print(f"Seeding SQLite database from {data_path}...")
    df = pd.read_parquet(data_path)

    records = []
    for idx, row in df.iterrows():
        # Extract the primary name
        names = row.get('names')
        name = 'Unknown'
        if isinstance(names, dict):
            name = names.get('primary', 'Unknown') or 'Unknown'

        # Extract category
        cats = row.get('categories')
        category = 'unknown'
        if isinstance(cats, dict):
            category = cats.get('primary', 'unknown') or 'unknown'

        # Extract address
        addrs = row.get('addresses')
        address_str = ''
        if isinstance(addrs, (list, np.ndarray)) and len(addrs) > 0:
            addr = addrs[0]
            if isinstance(addr, dict):
                parts = []
                if addr.get('freeform'):
                    parts.append(addr['freeform'])
                if addr.get('locality'):
                    parts.append(addr['locality'])
                if addr.get('region'):
                    parts.append(addr['region'])
                address_str = ', '.join(parts)

        # Build metadata dict matching what the model expects
        metadata = {}
        for col in ['websites', 'socials', 'emails', 'phones', 'brand', 'addresses', 'sources', 'categories']:
            val = row.get(col)
            if val is not None:
                if isinstance(val, np.ndarray):
                    val = val.tolist()
                metadata[col] = val
        metadata['confidence'] = float(row.get('confidence', 0))
        metadata['open'] = int(row.get('open', 1))

        # Store city/state from address for display
        if isinstance(addrs, (list, np.ndarray)) and len(addrs) > 0:
            addr = addrs[0]
            if isinstance(addr, dict):
                metadata['city'] = addr.get('locality', '')
                metadata['state'] = addr.get('region', '')

        records.append({
            'place_id': str(row.get('id', f'place_{idx}')),
            'name': name,
            'category': category,
            'address': address_str,
            'lat': None,
            'lon': None,
            'source': 'overture',
            'metadata_json': json.dumps(metadata, default=str),
        })

    with engine.begin() as conn:
        conn.execute(insert(Place), records)

    print(f"Seeded {len(records)} places into the SQLite database.")


# =============================================================================
# SEARCH
# =============================================================================

def _search_postgres(query: str, limit: int):
    """
    PostgreSQL search using pg_trgm trigram indexes for fuzzy matching.
    Requires the pg_trgm extension to be enabled on the database.
    """
    with engine.connect() as conn:
        try:
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

            results = conn.execute(sql, {
                "ilike_query": f"%{query}%",
                "query_str": query,
                "limit": limit
            }).fetchall()

            out = []
            for row in results:
                metadata = row.metadata_json or {}

                try:
                    pred = predict_place(metadata)
                    status = pred.get('status', 'unknown')
                    confidence = pred.get('confidence', 0.0)
                except Exception:
                    status = 'unknown'
                    confidence = 0.0

                location_str = f"Lon: {row.lon:.5f}, Lat: {row.lat:.5f}" if row.lon else "Unknown Location"
                if isinstance(metadata, dict):
                    if 'city' in metadata and 'state' in metadata:
                        location_str = f"{metadata.get('city', '')}, {metadata.get('state', '')}".strip(', ')

                out.append({
                    "id": str(row.place_id),
                    "name": row.name,
                    "address": location_str,
                    "status": status,
                    "confidence": confidence
                })

            return out
        except Exception as e:
            print(f"PostgreSQL search error: {e}")
            return []


def _search_sqlite(query: str, limit: int):
    """
    SQLite search using LIKE matching.
    Results are ranked by exact match > prefix match > contains match.
    """
    with engine.connect() as conn:
        try:
            sql = text("""
                SELECT place_id, name, address, lat, lon, metadata_json
                FROM places 
                WHERE name LIKE :ilike_query 
                   OR category LIKE :ilike_query
                ORDER BY 
                    CASE WHEN LOWER(name) = LOWER(:exact_query) THEN 0
                         WHEN LOWER(name) LIKE LOWER(:start_query) THEN 1
                         ELSE 2 END,
                    name
                LIMIT :limit
            """)

            results = conn.execute(sql, {
                "ilike_query": f"%{query}%",
                "exact_query": query,
                "start_query": f"{query}%",
                "limit": limit
            }).fetchall()

            out = []
            for row in results:
                address = row.address or "Unknown Location"

                metadata = {}
                if row.metadata_json:
                    try:
                        metadata = json.loads(row.metadata_json)
                    except Exception:
                        pass

                try:
                    pred = predict_place(metadata)
                    status = pred.get('status', 'unknown')
                    confidence = pred.get('confidence', 0.0)
                except Exception:
                    status = 'unknown'
                    confidence = 0.0

                out.append({
                    "id": str(row.place_id),
                    "name": row.name,
                    "address": address,
                    "status": status,
                    "confidence": confidence
                })

            return out
        except Exception as e:
            print(f"SQLite search error: {e}")
            return []


def search_places(query: str, limit: int = 20):
    """Routes search to the appropriate backend (PostgreSQL or SQLite)."""
    if not query or len(query.strip()) < 2:
        return []

    if IS_POSTGRES:
        return _search_postgres(query, limit)
    else:
        return _search_sqlite(query, limit)


# =============================================================================
# PLACE DETAIL LOOKUP
# =============================================================================

def _get_metadata_postgres(place_id: str):
    """PostgreSQL metadata lookup with JSONB."""
    with engine.connect() as conn:
        try:
            sql = text("SELECT metadata_json, name FROM places WHERE place_id = :place_id")
            row = conn.execute(sql, {"place_id": place_id}).fetchone()
            if row and row.metadata_json:
                metadata = row.metadata_json
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)
                metadata['name'] = row.name
                return metadata
            return None
        except Exception as e:
            print(f"PostgreSQL query error: {e}")
            return None


def _get_metadata_sqlite(place_id: str):
    """SQLite metadata lookup with JSON string parsing."""
    with engine.connect() as conn:
        try:
            sql = text("SELECT metadata_json, name, address FROM places WHERE place_id = :place_id")
            row = conn.execute(sql, {"place_id": place_id}).fetchone()
            if row and row.metadata_json:
                metadata = json.loads(row.metadata_json)
                metadata['name'] = row.name
                if row.address:
                    metadata['address_display'] = row.address
                return metadata
            return None
        except Exception as e:
            print(f"SQLite query error: {e}")
            return None


def get_place_metadata(place_id: str):
    """Routes metadata lookup to the appropriate backend."""
    if IS_POSTGRES:
        return _get_metadata_postgres(place_id)
    else:
        return _get_metadata_sqlite(place_id)
