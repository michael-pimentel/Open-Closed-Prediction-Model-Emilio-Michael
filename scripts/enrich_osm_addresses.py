"""
Enrich OSM place records in PostgreSQL with reverse-geocoded addresses
and additional location data from Nominatim.

Targets OSM source records where metadata_json has no 'address' field
but geom (coordinates) is present.

Rate-limited to 1 request/second per Nominatim usage policy.
Safe to re-run — only processes records without an address.

Usage:
    python scripts/enrich_osm_addresses.py
    python scripts/enrich_osm_addresses.py --db postgresql://user:pass@host/db
    python scripts/enrich_osm_addresses.py --dry-run     # preview without writing
    python scripts/enrich_osm_addresses.py --limit 50    # process first N records
    python scripts/enrich_osm_addresses.py --all-sources  # include non-OSM records too
"""

import argparse
import json
import os
import sys
import time

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary")

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip install requests")

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "stillopen", "backend", ".env"))
except ImportError:
    pass

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {"User-Agent": "StillOpen/1.0 (open-closed-predictor; contact: research)"}


def get_db_url(override=None):
    url = override or os.environ.get("DATABASE_URL", "")
    if not url or "postgresql" not in url:
        sys.exit("No PostgreSQL DATABASE_URL found. Set it or pass --db.")
    return url.replace("postgresql+psycopg2://", "postgresql://")


def reverse_geocode(lat: float, lon: float):
    """Call Nominatim reverse geocoding. Returns parsed JSON or None on error."""
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"lat": lat, "lon": lon, "format": "jsonv2", "addressdetails": 1},
            headers=HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"FAILED ({e})")
        return None


def build_address_string(addr: dict) -> str:
    """Build a human-readable address string from Nominatim address components."""
    parts = []
    house = addr.get("house_number", "")
    road = addr.get("road", "")
    if house and road:
        parts.append(f"{house} {road}")
    elif road:
        parts.append(road)

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or ""
    )
    if city:
        parts.append(city)

    state = addr.get("state", "")
    if state:
        parts.append(state)

    postcode = addr.get("postcode", "")
    if postcode:
        parts.append(postcode)

    return ", ".join(p for p in parts if p)


def enrich_metadata(meta: dict, nominatim: dict) -> dict:
    """
    Merge Nominatim response into existing metadata dict.
    Adds: address, city, state, postcode, neighbourhood, country, country_code.
    Does not overwrite existing non-empty values.
    """
    addr = nominatim.get("address", {})
    enriched = dict(meta)

    address_str = build_address_string(addr)
    # Fallback to full display_name if we couldn't build a structured address
    if not address_str:
        address_str = nominatim.get("display_name", "").split(",")[0].strip()

    if address_str:
        enriched["address"] = address_str

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
    )
    state = addr.get("state")
    postcode = addr.get("postcode")
    neighbourhood = (
        addr.get("neighbourhood")
        or addr.get("suburb")
        or addr.get("quarter")
    )
    country = addr.get("country")
    country_code = addr.get("country_code", "").upper() or None

    # Only set if not already present
    for key, val in [
        ("city", city),
        ("state", state),
        ("postcode", postcode),
        ("neighbourhood", neighbourhood),
        ("country", country),
        ("country_code", country_code),
    ]:
        if val and not enriched.get(key):
            enriched[key] = val

    return enriched


def main():
    parser = argparse.ArgumentParser(description="Reverse-geocode OSM records missing addresses")
    parser.add_argument("--db", default=None, help="PostgreSQL DSN (overrides DATABASE_URL)")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing to DB")
    parser.add_argument("--limit", type=int, default=None, help="Max records to process")
    parser.add_argument("--all-sources", action="store_true", help="Process all sources, not just OSM")
    args = parser.parse_args()

    db_url = get_db_url(args.db)
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    source_filter = "" if args.all_sources else "AND source = 'osm'"

    cur.execute(f"""
        SELECT
            place_id,
            ST_Y(geom::geometry) AS lat,
            ST_X(geom::geometry) AS lon,
            metadata_json
        FROM places
        WHERE geom IS NOT NULL
          {source_filter}
          AND (
              metadata_json->>'address' IS NULL
              OR TRIM(metadata_json->>'address') = ''
          )
        ORDER BY place_id
    """)
    rows = cur.fetchall()

    if args.limit:
        rows = rows[: args.limit]

    total = len(rows)
    print(f"Found {total} records needing address enrichment")
    if args.dry_run:
        print("  [DRY RUN — no changes will be written]\n")

    enriched_count = 0
    failed_count = 0
    skipped_count = 0

    for i, (place_id, lat, lon, meta) in enumerate(rows, 1):
        print(f"  [{i}/{total}] {place_id} ({lat:.5f}, {lon:.5f}) ... ", end="", flush=True)

        result = reverse_geocode(lat, lon)
        if result is None:
            failed_count += 1
            time.sleep(1)
            continue

        meta_dict = meta if isinstance(meta, dict) else {}
        enriched = enrich_metadata(meta_dict, result)
        address = enriched.get("address", "")

        if not address:
            print("(no address returned)")
            skipped_count += 1
            time.sleep(1)
            continue

        print(address)

        if not args.dry_run:
            cur.execute(
                "UPDATE places SET metadata_json = %s::jsonb, address = %s WHERE place_id = %s",
                (json.dumps(enriched), address, place_id),
            )

        enriched_count += 1
        # Nominatim usage policy: max 1 request/second
        time.sleep(1)

    if not args.dry_run:
        conn.commit()
        print(f"\nCommitted to DB.")

    print(
        f"\nResults: {enriched_count} enriched, "
        f"{skipped_count} skipped (no address), "
        f"{failed_count} failed"
    )
    conn.close()


if __name__ == "__main__":
    main()
