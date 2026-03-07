"""
Seed PostgreSQL with labeled OSM data (including closed places).

Run this after the DB is provisioned to add closed-business ground truth.
Safe to re-run — uses ON CONFLICT DO NOTHING.

Usage:
    python scripts/seed_postgres.py
    python scripts/seed_postgres.py --db postgresql+psycopg2://user:pass@host/db
"""

import argparse
import json
import os
import sys

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
PROJECT_ROOT = os.path.dirname(SCRIPTS_DIR)


def get_db_url(override=None):
    url = override or os.environ.get("DATABASE_URL", "")
    if not url or "postgresql" not in url:
        sys.exit("No PostgreSQL DATABASE_URL found. Set it or pass --db.")
    # Strip SQLAlchemy dialect prefix for psycopg2
    return url.replace("postgresql+psycopg2://", "postgresql://")


def seed_osm(cur, osm_path, existing_ids):
    if not os.path.exists(osm_path):
        print(f"  ✗ OSM file not found: {osm_path}")
        return 0, 0

    with open(osm_path) as f:
        data = json.load(f)

    records = []
    for item in data:
        pid = str(item["id"])
        if pid in existing_ids:
            continue

        meta = item.get("metadata", {})
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        address = item.get("address", "").strip()

        # Parse city/state from address string for metadata
        city, state = "", ""
        parts = [p.strip() for p in address.split(",")]
        if len(parts) >= 2:
            city = parts[-2] if len(parts) > 1 else ""
            state = parts[-1] if len(parts) > 0 else ""

        metadata = {
            "websites": meta.get("websites", []),
            "socials":  meta.get("socials", []),
            "phones":   meta.get("phones", []),
            "confidence": float(meta.get("confidence", 0.5)),
            "open": int(item.get("open", 1)),
            "city": city,
            "state": state,
        }
        # Store full address in metadata so canonical_metadata.py can use it
        if address:
            metadata["address"] = address

        lat = item.get("lat")
        lon = item.get("lon")
        geom = f"SRID=4326;POINT({lon} {lat})" if lat is not None and lon is not None else None

        records.append((
            pid,
            item.get("name", "Unknown"),
            item.get("category", "unknown"),
            address or None,
            "osm",
            geom,
            json.dumps(metadata),
        ))

    if not records:
        print("  ✓ OSM: all records already present, nothing to insert")
        return 0, 0

    closed = sum(1 for r in records if json.loads(r[6]).get("open") == 0)
    execute_values(cur, """
        INSERT INTO places (place_id, name, category, address, source, geom, metadata_json)
        VALUES %s
        ON CONFLICT (place_id) DO NOTHING
    """, records, template="(%s, %s, %s, %s, %s, ST_GeomFromEWKT(%s), %s::jsonb)")

    return len(records), closed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=None, help="PostgreSQL DSN (overrides DATABASE_URL)")
    args = parser.parse_args()

    db_url = get_db_url(args.db)
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT place_id FROM places")
    existing = {r[0] for r in cur.fetchall()}
    print(f"Existing places in DB: {len(existing)}")

    osm_path = os.path.join(SCRIPTS_DIR, "data", "osm_places.json")
    inserted, closed = seed_osm(cur, osm_path, existing)
    conn.commit()

    if inserted:
        print(f"  ✓ OSM: inserted {inserted} records ({closed} closed)")

    cur.execute("SELECT COUNT(*) FROM places")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM places WHERE (metadata_json->>'open')::int = 0")
    closed_total = cur.fetchone()[0]
    print(f"\nFinal: {total} total places, {closed_total} with open=0 (closed)")
    conn.close()


if __name__ == "__main__":
    main()
