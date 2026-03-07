import json
import os
import pandas as pd
import numpy as np
from sqlalchemy import text, insert

from .database import engine, Base, IS_POSTGRES
from .models import Place
from .predict import predict_place, predict_status
from utils.canonical_metadata import build_canonical_metadata


def _extract_place_info(row, metadata: dict) -> dict:
    """
    Returns a fully-populated dict from a DB row + metadata_json.
    All fields that are absent default to None – no placeholders generated.
    """
    metadata = metadata if isinstance(metadata, dict) else {}
    if "canonical" in metadata and "raw" in metadata:
        canonical = metadata.get("canonical") or {}
        raw = metadata.get("raw") or {}
    else:
        raw = metadata
        canonical = build_canonical_metadata(raw, lat=getattr(row, "lat", None), lon=getattr(row, "lon", None))

    try:
        pred = predict_status(raw)
        status = pred.get("status", "unknown")
        confidence = pred.get("confidence", 0.0)
    except Exception:
        status = "unknown"
        confidence = 0.0

    address = canonical.get("formatted_address") or ""
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
        "website": website,
        "phone": phone,
        "opening_hours": opening_hours,
        "photo_url": photo_url,
    }


# =============================================================================
# DATA SEEDING
# =============================================================================

def load_data_to_db():
    """
    Seeds the database on startup.
    - PostgreSQL: No-op
    - SQLite: Auto-seeds from parquet, extracting lat/lon from the bbox field.
      If an old seed exists where lat/lon were not extracted (all NULL),
      it is cleared and re-seeded automatically.
    """
    if IS_POSTGRES:
        return

    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM places")).fetchone()[0]
        if count > 0:
            # Detect old seed where coordinates were never extracted (all NULL).
            # If any row has a non-NULL lat we consider the seed valid.
            has_coords = conn.execute(
                text("SELECT COUNT(*) FROM places WHERE lat IS NOT NULL")
            ).fetchone()[0]
            if has_coords > 0:
                return
            print("Detected old seed with no coordinates — re-seeding from parquet...")

    data_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "project_c_samples.parquet")
    data_path = os.path.normpath(data_path)

    if not os.path.exists(data_path):
        data_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "project_c_samples.parquet")
        data_path = os.path.normpath(data_path)

    if not os.path.exists(data_path):
        return

    df = pd.read_parquet(data_path)

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

        # Extract lat/lon from the parquet bbox field (xmin/xmax=lon, ymin/ymax=lat)
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
        metadata['open'] = int(row.get('open', 1))

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
            'lat': lat,
            'lon': lon,
            'source': 'overture',
            'metadata_json': json.dumps(metadata, default=str),
        })

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM places"))
        conn.execute(insert(Place), records)
    print(f"Seeded {len(records)} places with coordinates.")


# =============================================================================
# POSTGRES SEARCH
# =============================================================================

def _search_postgres(
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
                    source,
                    ST_X(geom::geometry) AS lon,
                    ST_Y(geom::geometry) AS lat,
                    metadata_json
                FROM places
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT :limit OFFSET :offset;
            """)

            results = conn.execute(sql, params).fetchall()
            return [_extract_place_info(row, row.metadata_json or {}) for row in results]

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

            results = conn.execute(sql, params).fetchall()

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
                    "category": getattr(row, 'category', None),
                    "source": getattr(row, 'source', None),
                    "lat": getattr(row, 'lat', None),
                    "lon": getattr(row, 'lon', None),
                    "status": status,
                    "confidence": confidence
                })

            return out
        except Exception as e:
            print(f"SQLite search error: {e}")
            return []


def search_places(
    query: str,
    limit: int = 20,
    offset: int = 0,
    min_lat: float = None,
    max_lat: float = None,
    min_lon: float = None,
    max_lon: float = None,
):
    has_bbox = all(v is not None for v in [min_lat, max_lat, min_lon, max_lon])
    if not has_bbox and (not query or len(query.strip()) < 2):
        return []

    if IS_POSTGRES:
        return _search_postgres(
            query, limit, offset,
            min_lat=min_lat, max_lat=max_lat,
            min_lon=min_lon, max_lon=max_lon,
        )
    else:
        return _search_sqlite(
            query, limit, offset,
            min_lat=min_lat, max_lat=max_lat,
            min_lon=min_lon, max_lon=max_lon,
        )


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
                    place_id, name, category, source,
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
            return _extract_place_info(row, metadata)
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
                confidence = pred.get('confidence', 0.0)
            except Exception:
                status = 'unknown'
                confidence = 0.0

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
            }
        except Exception as e:
            print(f"SQLite get_place_record error: {e}")
            return None