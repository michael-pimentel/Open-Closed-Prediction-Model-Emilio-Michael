"""
Fetch Overture Maps places for California (or a test bbox) and load into Postgres.

Two-phase approach:
  Phase 1 — fetch_to_parquet(): downloads from Overture S3 → local parquet
  Phase 2 — load_to_postgres(): reads parquet → Postgres (batched, upsert)

Usage:
    # Test with Santa Cruz first
    python scripts/fetch_california_overture.py --bbox santa_cruz

    # Full California run (~300-500K records, 30-60 min)
    python scripts/fetch_california_overture.py --bbox california

    # Fetch only (skip DB load)
    python scripts/fetch_california_overture.py --bbox california --fetch-only

    # Load only (if parquet already downloaded)
    python scripts/fetch_california_overture.py --bbox california --load-only

    # Override DB connection
    python scripts/fetch_california_overture.py --bbox california --db postgresql://...
"""

import argparse
import json
import os
import sys

try:
    import duckdb
except ImportError:
    sys.exit("duckdb not installed. Run: pip install duckdb")

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary")

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "stillopen", "backend", ".env"))
except ImportError:
    pass

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPTS_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_RELEASE = "2026-02-18.0"
DEFAULT_CONFIDENCE = 0.7
BATCH_SIZE = 1000

# (lon_min, lat_min, lon_max, lat_max)
BBOX_PRESETS = {
    "california":  (-124.4, 32.5,  -114.1, 42.0),
    "santa_cruz":  (-122.10, 36.90, -121.95, 37.05),
    "san_jose":    (-122.05, 37.25, -121.75, 37.45),
    "san_francisco": (-122.52, 37.70, -122.35, 37.83),
    "los_angeles": (-118.67, 33.70, -118.15, 34.34),
}


# ---------------------------------------------------------------------------
# Phase 1: Fetch from Overture S3 → local parquet
# ---------------------------------------------------------------------------

def fetch_to_parquet(bbox_name: str, release: str, confidence: float) -> str:
    """Download Overture places for the given bbox preset → local parquet file.
    Returns the output parquet path."""

    bbox = BBOX_PRESETS.get(bbox_name)
    if bbox is None:
        sys.exit(f"Unknown bbox preset '{bbox_name}'. Choose from: {list(BBOX_PRESETS)}")

    lon_min, lat_min, lon_max, lat_max = bbox
    output_file = os.path.join(DATA_DIR, f"overture_{bbox_name}.parquet")
    s3_path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

    print(f"\n=== PHASE 1: Fetch from Overture (release {release}) ===")
    print(f"  Bbox preset : {bbox_name}  ({lon_min}, {lat_min}) → ({lon_max}, {lat_max})")
    print(f"  Confidence  : > {confidence}")
    print(f"  Output      : {output_file}")

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    con.execute("SET s3_access_key_id='';")
    con.execute("SET s3_secret_access_key='';")

    # Detect available columns
    schema = con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{s3_path}', hive_partitioning=true) LIMIT 1"
    ).fetchall()
    col_names = {row[0] for row in schema}
    print(f"  Overture columns available: {sorted(col_names)}")

    # Compute centroid lon/lat from bbox midpoints (no spatial extension needed)
    query = f"""
COPY (
    SELECT
        id,
        names,
        categories,
        confidence,
        websites,
        socials,
        emails,
        phones,
        brand,
        addresses,
        sources,
        (bbox.xmin + bbox.xmax) / 2.0 AS longitude,
        (bbox.ymin + bbox.ymax) / 2.0 AS latitude
    FROM read_parquet('{s3_path}', hive_partitioning=true)
    WHERE bbox.xmin > {lon_min}
      AND bbox.xmax < {lon_max}
      AND bbox.ymin > {lat_min}
      AND bbox.ymax < {lat_max}
      AND names.primary IS NOT NULL
      AND confidence > {confidence}
) TO '{output_file}' (FORMAT PARQUET);
"""

    print("\nDownloading from S3 (this may take a while for large areas)...")
    con.execute(query)

    count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{output_file}')").fetchone()[0]
    print(f"\n✅ Saved {count:,} records to {output_file}")

    # Coverage summary
    result = con.execute(f"""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN websites IS NOT NULL AND len(websites) > 0 THEN 1 ELSE 0 END) as has_web,
            SUM(CASE WHEN phones   IS NOT NULL AND len(phones)   > 0 THEN 1 ELSE 0 END) as has_phone,
            SUM(CASE WHEN socials  IS NOT NULL AND len(socials)  > 0 THEN 1 ELSE 0 END) as has_social
        FROM read_parquet('{output_file}')
    """).fetchone()
    t = result[0]
    if t > 0:
        print(f"\nMetadata coverage ({t:,} total):")
        print(f"  Website : {result[1]:,} ({result[1]/t*100:.1f}%)")
        print(f"  Phone   : {result[2]:,} ({result[2]/t*100:.1f}%)")
        print(f"  Social  : {result[3]:,} ({result[3]/t*100:.1f}%)")

    con.close()
    return output_file


# ---------------------------------------------------------------------------
# Phase 2: Load parquet → Postgres
# ---------------------------------------------------------------------------

def _parse_address(addresses) -> tuple[str, str, str]:
    """Extract (address_str, city, state) from an Overture addresses array.
    addresses is a list of dicts (DuckDB returns Row objects or dicts)."""
    if not addresses:
        return "", "", ""
    try:
        addr = addresses[0]
        if hasattr(addr, "_asdict"):
            addr = addr._asdict()
        elif not isinstance(addr, dict):
            addr = dict(addr)

        parts = []
        freeform = addr.get("freeform", "") or ""
        locality  = addr.get("locality", "") or ""
        region    = addr.get("region", "") or ""
        country   = addr.get("country", "") or ""

        if freeform:
            parts.append(freeform)
        if locality:
            parts.append(locality)
        if region:
            parts.append(region)
        if country and country != "US":
            parts.append(country)

        address_str = ", ".join(p for p in parts if p)
        return address_str, locality, region
    except Exception:
        return "", "", ""


def _safe_list(val) -> list:
    """Convert DuckDB array / None to a plain Python list of strings."""
    if val is None:
        return []
    try:
        return [str(v) for v in val if v is not None]
    except Exception:
        return []


def _safe_dict(val) -> dict:
    """Convert a DuckDB struct / None to a plain Python dict."""
    if val is None:
        return {}
    try:
        if hasattr(val, "_asdict"):
            return {k: v for k, v in val._asdict().items() if v is not None}
        if isinstance(val, dict):
            return {k: v for k, v in val.items() if v is not None}
        return {}
    except Exception:
        return {}


def load_to_postgres(parquet_file: str, db_url: str) -> None:
    """Read parquet in batches and upsert into Postgres places table."""
    if not os.path.exists(parquet_file):
        sys.exit(f"Parquet file not found: {parquet_file}")

    # Strip SQLAlchemy dialect prefix for psycopg2
    pg_url = db_url.replace("postgresql+psycopg2://", "postgresql://")

    print(f"\n=== PHASE 2: Load into Postgres ===")
    print(f"  Source : {parquet_file}")
    print(f"  DB     : {pg_url[:pg_url.find('@')+1]}***")  # hide password

    conn = psycopg2.connect(pg_url)
    cur = conn.cursor()

    # Count before
    cur.execute("SELECT COUNT(*) FROM places")
    count_before = cur.fetchone()[0]
    print(f"  Records in DB before load: {count_before:,}")

    # Count existing place_ids to distinguish inserts vs updates
    cur.execute("SELECT place_id FROM places WHERE source = 'overture'")
    existing_ids = {r[0] for r in cur.fetchall()}
    print(f"  Existing overture records : {len(existing_ids):,}")

    # Read parquet with DuckDB for easy batch iteration
    con = duckdb.connect()
    total_rows = con.execute(f"SELECT COUNT(*) FROM read_parquet('{parquet_file}')").fetchone()[0]
    print(f"  Total rows in parquet     : {total_rows:,}")
    print(f"  Batch size                : {BATCH_SIZE:,}")

    inserted = 0
    updated = 0
    skipped = 0
    offset = 0

    print("\nLoading records...")
    while offset < total_rows:
        rows = con.execute(f"""
            SELECT
                id,
                names.primary      AS name,
                categories.primary AS category,
                confidence,
                websites,
                socials,
                emails,
                phones,
                brand,
                addresses,
                sources,
                longitude,
                latitude
            FROM read_parquet('{parquet_file}')
            LIMIT {BATCH_SIZE} OFFSET {offset}
        """).fetchall()

        if not rows:
            break

        records = []
        for row in rows:
            (
                place_id, name, category, confidence,
                websites, socials, emails, phones,
                brand, addresses, sources,
                lon, lat
            ) = row

            if not name or not place_id:
                skipped += 1
                continue

            address_str, city, state = _parse_address(addresses)

            metadata = {
                "websites":   _safe_list(websites),
                "socials":    _safe_list(socials),
                "phones":     _safe_list(phones),
                "emails":     _safe_list(emails),
                "brand":      _safe_dict(brand),
                "addresses":  [_safe_dict(a) for a in (addresses or [])],
                "sources":    [_safe_dict(s) for s in (sources or [])],
                "confidence": float(confidence) if confidence is not None else 0.0,
                "open":       1,   # Overture only tracks operating places
                "city":       city,
                "state":      state,
            }

            geom = f"SRID=4326;POINT({lon} {lat})" if lon is not None and lat is not None else None

            records.append((
                str(place_id),
                str(name)[:512],
                str(category)[:256] if category else None,
                address_str[:512] if address_str else None,
                "overture",
                geom,
                json.dumps(metadata),
            ))

        if not records:
            offset += BATCH_SIZE
            continue

        batch_new = sum(1 for r in records if r[0] not in existing_ids)
        batch_upd = len(records) - batch_new

        execute_values(cur, """
            INSERT INTO places (place_id, name, category, address, source, geom, metadata_json)
            VALUES %s
            ON CONFLICT (place_id) DO UPDATE SET
                name          = EXCLUDED.name,
                category      = EXCLUDED.category,
                address       = EXCLUDED.address,
                source        = EXCLUDED.source,
                geom          = EXCLUDED.geom,
                metadata_json = EXCLUDED.metadata_json,
                last_updated  = NOW()
        """, records, template="(%s, %s, %s, %s, %s, ST_GeomFromEWKT(%s), %s::jsonb)")

        conn.commit()

        inserted += batch_new
        updated  += batch_upd
        for r in records:
            existing_ids.add(r[0])

        offset += BATCH_SIZE
        processed = min(offset, total_rows)
        if processed % 10_000 < BATCH_SIZE or processed >= total_rows:
            print(f"  {processed:>8,} / {total_rows:,} processed  "
                  f"(+{inserted:,} new, ~{updated:,} updated, {skipped:,} skipped)")

    con.close()

    # Count after
    cur.execute("SELECT COUNT(*) FROM places")
    count_after = cur.fetchone()[0]

    print(f"\n=== Load Summary ===")
    print(f"  Records fetched from parquet : {total_rows:,}")
    print(f"  Records inserted (new)       : {inserted:,}")
    print(f"  Records updated (existing)   : {updated:,}")
    print(f"  Records skipped (bad data)   : {skipped:,}")
    print(f"  DB total before              : {count_before:,}")
    print(f"  DB total after               : {count_after:,}")
    print(f"  Net new records              : {count_after - count_before:,}")

    conn.close()


# ---------------------------------------------------------------------------
# Phase 3: Verify
# ---------------------------------------------------------------------------

def verify(db_url: str) -> None:
    """Query DB and print post-load stats."""
    pg_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(pg_url)
    cur = conn.cursor()

    print("\n=== PHASE 3: Verification ===")

    cur.execute("SELECT COUNT(*) FROM places")
    print(f"  Total places in DB : {cur.fetchone()[0]:,}")

    cur.execute("SELECT source, COUNT(*) FROM places GROUP BY source ORDER BY COUNT(*) DESC")
    print("\n  Count by source:")
    for row in cur.fetchall():
        print(f"    {row[0] or 'NULL':20s} : {row[1]:>8,}")

    cur.execute("""
        SELECT category, COUNT(*) as cnt
        FROM places
        WHERE source = 'overture'
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 10
    """)
    rows = cur.fetchall()
    if rows:
        print("\n  Top 10 categories (overture):")
        for row in rows:
            print(f"    {str(row[0] or 'unknown'):30s} : {row[1]:>6,}")

    cur.execute("""
        SELECT
            metadata_json->>'city' AS city,
            COUNT(*) as cnt
        FROM places
        WHERE source = 'overture'
          AND metadata_json->>'city' IS NOT NULL
          AND metadata_json->>'city' != ''
        GROUP BY city
        ORDER BY cnt DESC
        LIMIT 10
    """)
    rows = cur.fetchall()
    if rows:
        print("\n  Top 10 cities (overture):")
        for row in rows:
            print(f"    {str(row[0]):30s} : {row[1]:>6,}")

    conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def get_db_url(override=None) -> str:
    url = override or os.environ.get("DATABASE_URL", "")
    if not url or "postgresql" not in url:
        sys.exit(
            "No PostgreSQL DATABASE_URL found. "
            "Set it in stillopen/backend/.env or pass --db postgresql://..."
        )
    return url


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Overture places for a region and load into Postgres"
    )
    parser.add_argument(
        "--bbox",
        default="santa_cruz",
        choices=list(BBOX_PRESETS.keys()),
        help=f"Bbox preset (default: santa_cruz for testing). Choices: {list(BBOX_PRESETS.keys())}",
    )
    parser.add_argument("--release", default=DEFAULT_RELEASE, help="Overture release string")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE,
                        help="Minimum confidence threshold (default 0.7)")
    parser.add_argument("--db", default=None, help="PostgreSQL DSN (overrides DATABASE_URL)")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch parquet, skip DB load")
    parser.add_argument("--load-only", action="store_true",
                        help="Skip fetch, load existing parquet to DB")
    parser.add_argument("--no-verify", action="store_true", help="Skip verification step")
    args = parser.parse_args()

    parquet_file = os.path.join(DATA_DIR, f"overture_{args.bbox}.parquet")

    # Phase 1
    if not args.load_only:
        parquet_file = fetch_to_parquet(args.bbox, args.release, args.confidence)
    else:
        if not os.path.exists(parquet_file):
            sys.exit(f"--load-only specified but parquet not found: {parquet_file}")
        print(f"Skipping fetch; using existing parquet: {parquet_file}")

    # Phase 2
    if not args.fetch_only:
        db_url = get_db_url(args.db)
        load_to_postgres(parquet_file, db_url)

        # Phase 3 — verify
        if not args.no_verify:
            verify(db_url)

    print("\nDone.")


if __name__ == "__main__":
    main()
