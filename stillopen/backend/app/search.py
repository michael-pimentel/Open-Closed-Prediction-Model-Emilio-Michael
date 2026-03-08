import json
import os
import time
import pandas as pd
import numpy as np
from sqlalchemy import text, insert

from .database import engine, Base, IS_POSTGRES
from .models import Place
from .predict import predict_place, predict_status, predict_batch
from .utils import reverse_geocode
from utils.canonical_metadata import build_canonical_metadata

# ---------------------------------------------------------------------------
# Simple in-memory query cache (TTL = 60 s, max 256 entries)
# ---------------------------------------------------------------------------
_CACHE_TTL = 60.0
_CACHE_MAX = 256
_cache: dict = {}  # key -> (timestamp, result)


def _cache_get(key):
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key, value):
    if len(_cache) >= _CACHE_MAX:
        # Evict oldest entry
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[key] = (time.monotonic(), value)


def _extract_place_info(row, metadata: dict, address_override: str = None, pred: dict = None) -> dict:
    """
    Returns a fully-populated dict from a DB row + metadata_json.
    Pass `pred` to skip running the ML model (used by batch search path).
    """
    metadata = metadata if isinstance(metadata, dict) else {}
    if "canonical" in metadata and "raw" in metadata:
        canonical = metadata.get("canonical") or {}
        raw = metadata.get("raw") or {}
    else:
        raw = metadata
        canonical = build_canonical_metadata(raw, lat=getattr(row, "lat", None), lon=getattr(row, "lon", None))

    if pred is None:
        try:
            pred = predict_status(raw)
        except Exception:
            pred = {}
    status = pred.get("status", "unknown")
    confidence = pred.get("confidence", 0.0)

    address = address_override or getattr(row, "address", None) or canonical.get("formatted_address") or ""
    website = canonical.get("website")
    phone = canonical.get("international_phone_number")

    opening_hours = None
    oh = canonical.get("opening_hours")
    if isinstance(oh, dict):
        wt = oh.get("weekday_text")
        if isinstance(wt, list) and wt:
            opening_hours = " | ".join(str(x) for x in wt if x is not None)

    photo_url = None
    photos = canonical.get("photos")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict):
            photo_url = first.get("photo_reference")

    return {
        "id": str(row.place_id),
        "name": canonical.get("name") or row.name,
        "category": row.category,
        "source": row.source,
        "lat": row.lat,
        "lon": row.lon,
        "metadata_json": raw,
        "address": address,
        "status": status,
        "confidence": confidence,
        "prediction_type": pred.get("prediction_type"),
        "website": website,
        "phone": phone,
        "opening_hours": opening_hours,
        "photo_url": photo_url,
        "website_status": raw.get("website_status"),
        "website_checked_at": raw.get("website_checked_at"),
        "website_http_code": raw.get("website_http_code"),
    }


# =============================================================================
# DATA SEEDING
# =============================================================================

def _records_from_overture_parquet(df, id_prefix="overture"):
    """Convert an Overture-format parquet DataFrame into DB record dicts."""
    records = []
    for idx, row in df.iterrows():
        names = row.get('names')
        name = 'Unknown'
        if isinstance(names, dict):
            name = names.get('primary', 'Unknown') or 'Unknown'

        cats = row.get('categories')
        category = 'unknown'
        if isinstance(cats, dict):
            category = cats.get('primary', 'unknown') or 'unknown'

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

        # Extract lat/lon from bbox field (xmin/xmax=lon, ymin/ymax=lat)
        lat = None
        lon = None
        bbox_data = row.get('bbox')
        if isinstance(bbox_data, dict):
            try:
                ymin = bbox_data.get('ymin')
                ymax = bbox_data.get('ymax')
                xmin = bbox_data.get('xmin')
                xmax = bbox_data.get('xmax')
                if ymin is not None and ymax is not None:
                    lat = (float(ymin) + float(ymax)) / 2.0
                if xmin is not None and xmax is not None:
                    lon = (float(xmin) + float(xmax)) / 2.0
            except (TypeError, ValueError):
                pass

        metadata = {}
        for col in ['websites', 'socials', 'emails', 'phones', 'brand', 'addresses', 'sources', 'categories']:
            val = row.get(col)
            if val is not None:
                if isinstance(val, np.ndarray):
                    val = val.tolist()
                metadata[col] = val

        metadata['confidence'] = float(row.get('confidence', 0))
        metadata['open'] = int(row.get('open', 1)) if 'open' in row.index else 1

        if isinstance(addrs, (list, np.ndarray)) and len(addrs) > 0:
            addr = addrs[0]
            if isinstance(addr, dict):
                metadata['city'] = addr.get('locality', '')
                metadata['state'] = addr.get('region', '')

        records.append({
            'place_id': str(row.get('id', f'{id_prefix}_{idx}')),
            'name': name,
            'category': category,
            'address': address_str,
            'lat': lat,
            'lon': lon,
            'source': 'overture',
            'metadata_json': json.dumps(metadata, default=str),
        })
    return records


def _records_from_osm_json(data):
    """Convert OSM JSON records into DB record dicts."""
    records = []
    for item in data:
        meta = item.get('metadata', {})
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        metadata = {
            'websites': meta.get('websites', []),
            'socials': meta.get('socials', []),
            'phones': meta.get('phones', []),
            'confidence': float(meta.get('confidence', 0.5)),
            'open': int(item.get('open', 1)),
            'city': '',
            'state': '',
        }

        addr = item.get('address', '')
        parts = [p.strip() for p in addr.split(',')]
        if len(parts) >= 2:
            metadata['city'] = parts[-2] if len(parts) > 1 else ''
            metadata['state'] = parts[-1] if len(parts) > 0 else ''

        records.append({
            'place_id': str(item.get('id', f"osm_{item.get('name', '')}_{len(records)}")),
            'name': item.get('name', 'Unknown'),
            'category': item.get('category', 'unknown'),
            'address': addr,
            'lat': item.get('lat'),
            'lon': item.get('lon'),
            'source': 'osm',
            'metadata_json': json.dumps(metadata, default=str),
        })
    return records


def load_data_to_db():
    """
    Seeds the database on startup.
    - PostgreSQL: No-op
    - SQLite: Seeds from project_c_samples.parquet, then supplements with
      scripts/data/overture_places_us.parquet and scripts/data/osm_places.json
      if present, giving a much richer dataset including closed places.
    """
    if IS_POSTGRES:
        return

    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM places")).fetchone()[0]
        if count > 0:
            has_coords = conn.execute(
                text("SELECT COUNT(*) FROM places WHERE lat IS NOT NULL")
            ).fetchone()[0]
            if has_coords > 0:
                return
            print("Detected old seed with no coordinates — re-seeding...")

    # --- Source 1: original project parquet ---
    backend_root = os.path.dirname(os.path.dirname(__file__))
    project_root = os.path.normpath(os.path.join(backend_root, "..", ".."))

    data_path = os.path.normpath(os.path.join(project_root, "data", "project_c_samples.parquet"))
    if not os.path.exists(data_path):
        data_path = os.path.normpath(os.path.join(backend_root, "..", "data", "project_c_samples.parquet"))

    records = []
    seen_ids = set()

    if os.path.exists(data_path):
        df = pd.read_parquet(data_path)
        orig_records = _records_from_overture_parquet(df, id_prefix="orig")
        for r in orig_records:
            seen_ids.add(r['place_id'])
            records.append(r)
        print(f"  Loaded {len(orig_records)} places from project_c_samples.parquet")

    # --- Source 2: Overture US parquet (large dataset) ---
    overture_us_path = os.path.normpath(os.path.join(project_root, "scripts", "data", "overture_places_us.parquet"))
    if os.path.exists(overture_us_path):
        df_us = pd.read_parquet(overture_us_path)
        overture_records = _records_from_overture_parquet(df_us, id_prefix="overture_us")
        added = 0
        for r in overture_records:
            if r['place_id'] not in seen_ids:
                seen_ids.add(r['place_id'])
                records.append(r)
                added += 1
        print(f"  Loaded {added} additional places from overture_places_us.parquet")

    # --- Source 3: OSM places (includes closed businesses) ---
    osm_path = os.path.normpath(os.path.join(project_root, "scripts", "data", "osm_places.json"))
    if os.path.exists(osm_path):
        with open(osm_path) as f:
            osm_data = json.load(f)
        osm_records = _records_from_osm_json(osm_data)
        added = 0
        for r in osm_records:
            if r['place_id'] not in seen_ids:
                seen_ids.add(r['place_id'])
                records.append(r)
                added += 1
        closed_count = sum(1 for item in osm_data if item.get('open') == 0)
        print(f"  Loaded {added} additional places from osm_places.json ({closed_count} marked closed)")

    if not records:
        print("No data sources found — DB will be empty.")
        return

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM places"))
        conn.execute(insert(Place), records)
    print(f"Seeded {len(records)} total places into DB.")


# =============================================================================
# POSTGRES SEARCH
# =============================================================================

def _search_postgres(
    query: str,
    city: str = None,
    limit: int = 20,
    offset: int = 0,
    min_lat: float = None,
    max_lat: float = None,
    min_lon: float = None,
    max_lon: float = None,
):
    has_bbox = all(v is not None for v in [min_lat, max_lat, min_lon, max_lon])
    has_query = query and len(query.strip()) >= 2
    has_city = city and len(city.strip()) >= 2
    
    if not has_bbox and not has_query and not has_city:
        return []

    with engine.connect() as conn:
        try:
            params = {
                "limit": limit,
                "offset": offset,
            }

            # Build WHERE clauses
            where_parts = []

            if has_query:
                where_parts.append(
                    "(name ILIKE :ilike_query OR similarity(name, :query_str) > 0.15)"
                )
                params["ilike_query"] = f"%{query}%"
                params["query_str"] = query

            if has_city:
                where_parts.append(
                    "(address ILIKE :ilike_city OR metadata_json->>'addr:city' ILIKE :ilike_city)"
                )
                params["ilike_city"] = f"%{city}%"

            if has_bbox:
                where_parts.append(
                    "geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)"
                )
                params.update({
                    "min_lon": min_lon,
                    "min_lat": min_lat,
                    "max_lon": max_lon,
                    "max_lat": max_lat,
                })

            where_clause = " AND ".join(where_parts) if where_parts else "TRUE"

            # Use name similarity for ordering when a text query is present,
            # otherwise fall back to name alphabetical.
            if has_query:
                order_clause = "similarity(name, :query_str) DESC"
            else:
                order_clause = "name"

            sql = text(f"""
                SELECT
                    place_id,
                    name,
                    category,
                    address,
                    source,
                    ST_X(geom::geometry) AS lon,
                    ST_Y(geom::geometry) AS lat,
                    metadata_json
                FROM places
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT :limit OFFSET :offset;
            """)

            rows = conn.execute(sql, params).fetchall()

            # Batch ML prediction — one model call for all rows
            raw_metadatas = []
            for row in rows:
                meta = row.metadata_json or {}
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                raw_metadatas.append(meta)

            preds = predict_batch(raw_metadatas)
            return [
                _extract_place_info(row, meta, pred=pred)
                for row, meta, pred in zip(rows, raw_metadatas, preds)
            ]

        except Exception as e:
            print(f"PostgreSQL search error: {e}")
            return []


# =============================================================================
# SQLITE SEARCH
# =============================================================================

def _search_sqlite(
    query: str,
    limit: int = 20,
    offset: int = 0,
    min_lat: float = None,
    max_lat: float = None,
    min_lon: float = None,
    max_lon: float = None,
):
    has_bbox = all(v is not None for v in [min_lat, max_lat, min_lon, max_lon])
    has_query = query and len(query.strip()) >= 2
    if not has_bbox and not has_query:
        return []

    with engine.connect() as conn:
        try:
            where_parts = []
            params = {"limit": limit, "offset": offset}

            if has_query:
                where_parts.append(
                    "(name LIKE :ilike_query OR category LIKE :ilike_query)"
                )
                params["ilike_query"] = f"%{query}%"
                params["exact_query"] = query
                params["start_query"] = f"{query}%"

            if has_bbox:
                where_parts.append(
                    "lat BETWEEN :min_lat AND :max_lat AND lon BETWEEN :min_lon AND :max_lon"
                )
                params.update({
                    "min_lat": min_lat,
                    "max_lat": max_lat,
                    "min_lon": min_lon,
                    "max_lon": max_lon,
                })

            where_clause = " AND ".join(where_parts) if where_parts else "1=1"

            if has_query:
                order_clause = """CASE WHEN LOWER(name) = LOWER(:exact_query) THEN 0
                         WHEN LOWER(name) LIKE LOWER(:start_query) THEN 1
                         ELSE 2 END, name"""
            else:
                order_clause = "name"

            sql = text(f"""
                SELECT place_id, name, address, category, source, lat, lon, metadata_json
                FROM places
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT :limit OFFSET :offset
            """)

            rows = conn.execute(sql, params).fetchall()

            # Parse metadata for all rows first
            metadatas = []
            for row in rows:
                metadata = {}
                if row.metadata_json:
                    try:
                        metadata = json.loads(row.metadata_json)
                    except Exception:
                        pass
                metadatas.append(metadata)

            # Batch ML prediction — one model call for all rows
            preds = predict_batch(metadatas)

            out = []
            for row, metadata, pred in zip(rows, metadatas, preds):
                out.append({
                    "id": str(row.place_id),
                    "name": row.name,
                    "address": row.address or "Unknown Location",
                    "category": getattr(row, 'category', None),
                    "source": getattr(row, 'source', None),
                    "lat": getattr(row, 'lat', None),
                    "lon": getattr(row, 'lon', None),
                    "status": pred.get('status', 'unknown'),
                    "confidence": pred.get('confidence'),
                    "prediction_type": pred.get('prediction_type'),
                    "website_status": metadata.get("website_status"),
                    "website_checked_at": metadata.get("website_checked_at"),
                    "website_http_code": metadata.get("website_http_code"),
                })

            return out
        except Exception as e:
            print(f"SQLite search error: {e}")
            return []


def search_places(
    query: str,
    city: str = None,
    limit: int = 20,
    offset: int = 0,
    min_lat: float = None,
    max_lat: float = None,
    min_lon: float = None,
    max_lon: float = None,
):
    has_bbox = all(v is not None for v in [min_lat, max_lat, min_lon, max_lon])
    has_query = query and len(query.strip()) >= 2
    has_city = city and len(city.strip()) >= 2

    if not has_bbox and not has_query and not has_city:
        return []

    cache_key = (query, city, limit, offset, min_lat, max_lat, min_lon, max_lon)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    if IS_POSTGRES:
        result = _search_postgres(
            query,
            city=city,
            limit=limit,
            offset=offset,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
        )
    else:
        result = _search_sqlite(
            query, limit, offset,
            min_lat=min_lat, max_lat=max_lat,
            min_lon=min_lon, max_lon=max_lon,
        )

    _cache_set(cache_key, result)
    return result


# =============================================================================
# PLACE DETAIL LOOKUP
# =============================================================================

def _get_metadata_postgres(place_id: str):
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
    if IS_POSTGRES:
        return _get_metadata_postgres(place_id)
    else:
        return _get_metadata_sqlite(place_id)


def get_place_record(place_id: str):
    """
    Return a fully-populated place dict (with prediction, canonical fields)
    for the /place/{place_id} detail route, or None if not found.
    """
    if IS_POSTGRES:
        return _get_place_record_postgres(place_id)
    else:
        return _get_place_record_sqlite(place_id)


def _get_place_record_postgres(place_id: str):
    with engine.connect() as conn:
        try:
            sql = text("""
                SELECT
                    place_id, name, category, address, source,
                    ST_X(geom::geometry) AS lon,
                    ST_Y(geom::geometry) AS lat,
                    metadata_json
                FROM places
                WHERE place_id = :place_id
            """)
            row = conn.execute(sql, {"place_id": place_id}).fetchone()
            if not row:
                return None
            metadata = row.metadata_json or {}
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            # --- JIT Reverse Geocoding ---
            # If address is missing, try to fetch it and update DB
            current_address = getattr(row, "address", None)
            if not current_address and row.lat and row.lon:
                try:
                    new_address = reverse_geocode(row.lat, row.lon)
                    if new_address:
                        # Update database
                        with engine.begin() as update_conn:
                            update_conn.execute(
                                text("UPDATE places SET address = :addr, metadata_json = metadata_json || jsonb_build_object('address', :addr) WHERE place_id = :pid"),
                                {"addr": new_address, "pid": place_id}
                            )
                        # Re-fetch row or just manually update current_address
                        current_address = new_address
                except Exception as e:
                    print(f"JIT Geocoding failed: {e}")

            # Return info (manually inject current_address into row if we re-fetch, 
            # or just rely on _extract_place_info using row.address)
            return _extract_place_info(row, metadata, address_override=current_address)
        except Exception as e:
            print(f"PostgreSQL get_place_record error: {e}")
            return None


def _get_place_record_sqlite(place_id: str):
    with engine.connect() as conn:
        try:
            sql = text("""
                SELECT place_id, name, address, category, source, lat, lon, metadata_json
                FROM places
                WHERE place_id = :place_id
            """)
            row = conn.execute(sql, {"place_id": place_id}).fetchone()
            if not row:
                return None

            metadata = {}
            if row.metadata_json:
                try:
                    metadata = json.loads(row.metadata_json)
                except Exception:
                    pass

            try:
                pred = predict_place(metadata)
                status = pred.get('status', 'unknown')
                confidence = pred.get('confidence')
                prediction_type = pred.get('prediction_type')
            except Exception:
                status = 'unknown'
                confidence = None
                prediction_type = None

            return {
                "id": str(row.place_id),
                "name": row.name,
                "address": row.address or "",
                "category": getattr(row, 'category', None),
                "source": getattr(row, 'source', None),
                "lat": getattr(row, 'lat', None),
                "lon": getattr(row, 'lon', None),
                "metadata_json": metadata,
                "status": status,
                "confidence": confidence,
                "prediction_type": prediction_type,
                "website_status": metadata.get("website_status"),
                "website_checked_at": metadata.get("website_checked_at"),
                "website_http_code": metadata.get("website_http_code"),
            }
        except Exception as e:
            print(f"SQLite get_place_record error: {e}")
            return None