"""
Fetch Overture Maps places data using DuckDB + S3 (no AWS account needed).

Usage:
    python scripts/fetch_overture.py                      # US-wide, latest release
    python scripts/fetch_overture.py --city "Santa Cruz"  # bbox around a city
    python scripts/fetch_overture.py --limit 100000       # larger download

Outputs:
    scripts/data/overture_places_us.parquet  (default)
    scripts/data/overture_<city>.parquet     (when --city is given)
"""

import argparse
import os
import sys

try:
    import duckdb
except ImportError:
    sys.exit("duckdb not installed. Run: pip install duckdb")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Update this to the latest release date as new releases come out
DEFAULT_RELEASE = "2026-02-18.0"

# Rough bounding boxes for common cities (lon_min, lat_min, lon_max, lat_max)
CITY_BBOXES = {
    "santa cruz":        (-122.10, 36.90, -121.95, 37.05),
    "san jose":          (-122.05, 37.25, -121.75, 37.45),
    "san francisco":     (-122.52, 37.70, -122.35, 37.83),
    "los angeles":       (-118.67, 33.70, -118.15, 34.34),
    "new york":          (-74.26, 40.49, -73.70, 40.92),
    "chicago":           (-87.94, 41.64, -87.52, 42.02),
    "seattle":           (-122.46, 47.49, -122.23, 47.73),
    "austin":            (-97.93, 30.10, -97.57, 30.52),
    "portland":          (-122.84, 45.43, -122.47, 45.65),
    "denver":            (-105.11, 39.61, -104.72, 39.91),
}


def get_bbox_for_city(city_name: str):
    key = city_name.lower().strip()
    if key in CITY_BBOXES:
        return CITY_BBOXES[key]
    # Try partial match
    for k, v in CITY_BBOXES.items():
        if key in k or k in key:
            return v
    return None


def fetch(release: str, limit: int, output_file: str, bbox=None, country: str = "US"):
    s3_path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

    print(f"Connecting to Overture release {release}...")
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    con.execute("SET s3_access_key_id='';")
    con.execute("SET s3_secret_access_key='';")

    # Detect available columns
    schema = con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{s3_path}', filename=true, hive_partitioning=true) LIMIT 1"
    ).fetchall()
    col_names = {row[0] for row in schema}
    print(f"Available columns: {sorted(col_names)}")

    select_cols = [
        "id", "names", "categories", "confidence",
        "websites", "socials", "emails", "phones",
        "brand", "addresses", "sources", "bbox",
    ]
    if "operating_status" in col_names:
        select_cols.append("operating_status")

    select_str = ", ".join(select_cols)

    where_parts = [
        "addresses IS NOT NULL",
        "len(addresses) > 0",
    ]
    if bbox:
        lon_min, lat_min, lon_max, lat_max = bbox
        where_parts.append(
            f"bbox.xmin BETWEEN {lon_min} AND {lon_max} "
            f"AND bbox.ymin BETWEEN {lat_min} AND {lat_max}"
        )
    else:
        where_parts.append(f"addresses[1].country = '{country}'")

    where_clause = " AND ".join(where_parts)

    query = f"""
COPY (
    SELECT {select_str}
    FROM read_parquet('{s3_path}', filename=true, hive_partitioning=true)
    WHERE {where_clause}
    LIMIT {limit}
) TO '{output_file}' (FORMAT PARQUET);
"""
    print(f"Downloading up to {limit:,} places...")
    con.execute(query)

    count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{output_file}')").fetchone()[0]
    print(f"\n✅ Saved {count:,} records to {output_file}")

    if "operating_status" in col_names:
        dist = con.execute(f"""
            SELECT operating_status, COUNT(*) as cnt
            FROM read_parquet('{output_file}')
            GROUP BY operating_status ORDER BY cnt DESC
        """).fetchall()
        print("\noperating_status distribution:")
        for row in dist:
            print(f"  {row[0]}: {row[1]:,}")

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
    print(f"\nMetadata coverage ({t:,} total):")
    print(f"  Website : {result[1]:,} ({result[1]/t*100:.1f}%)")
    print(f"  Phone   : {result[2]:,} ({result[2]/t*100:.1f}%)")
    print(f"  Social  : {result[3]:,} ({result[3]/t*100:.1f}%)")

    con.close()


def main():
    parser = argparse.ArgumentParser(description="Fetch Overture Maps places via DuckDB")
    parser.add_argument("--release", default=DEFAULT_RELEASE, help="Overture release date string")
    parser.add_argument("--limit", type=int, default=50000, help="Max rows to download")
    parser.add_argument("--city", default=None, help="City name to filter by bbox")
    parser.add_argument("--country", default="US", help="Country code filter (default: US)")
    parser.add_argument("--output", default=None, help="Output parquet path (auto-named if not set)")
    args = parser.parse_args()

    bbox = None
    if args.city:
        bbox = get_bbox_for_city(args.city)
        if not bbox:
            sys.exit(f"Unknown city '{args.city}'. Add it to CITY_BBOXES or use --output with a manual bbox.")
        default_out = os.path.join(DATA_DIR, f"overture_{args.city.lower().replace(' ', '_')}.parquet")
    else:
        default_out = os.path.join(DATA_DIR, "overture_places_us.parquet")

    output_file = args.output or default_out
    fetch(args.release, args.limit, output_file, bbox=bbox, country=args.country)


if __name__ == "__main__":
    main()
