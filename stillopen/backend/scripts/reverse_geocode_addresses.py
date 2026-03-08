import os
import sys
import time
import logging
import argparse
from typing import Optional
from geopy.geocoders import Nominatim, GoogleV3
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from dotenv import load_dotenv

# Add backend dir to path
sys.path.insert(0, os.path.dirname(__file__))
from ingest_utils import get_conn, logger as _base

load_dotenv()

logger = logging.getLogger("ingest.reverse_geocode")

def reverse_geocode_nominatim(lat: float, lon: float) -> Optional[str]:
    geolocator = Nominatim(user_agent="stillopen_backfiller")
    try:
        location = geolocator.reverse((lat, lon), timeout=10)
        return location.address if location else None
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        logger.warning(f"Geocoding error for {lat}, {lon}: {e}")
        return None

def reverse_geocode_google(lat: float, lon: float, api_key: str) -> Optional[str]:
    geolocator = GoogleV3(api_key=api_key)
    try:
        location = geolocator.reverse((lat, lon), timeout=10)
        return location.address if location else None
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        logger.warning(f"Google Geocoding error for {lat}, {lon}: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Reverse geocode missing addresses")
    parser.add_argument("--limit", type=int, default=100, help="Maximum number of places to process in this run")
    parser.add_argument("--batch-size", type=int, default=10, help="Commit every N records")
    parser.add_argument("--delay", type=float, default=2.0, help="Delay between requests in seconds")
    parser.add_argument("--google-key", type=str, help="Google Maps API Key (optional)")
    args = parser.parse_args()

    google_key = args.google_key or os.environ.get("GOOGLE_MAPS_API_KEY")

    conn = get_conn()
    
    # Select places with missing address
    # In PostgreSQL, we use ST_Y(geom::geometry) for lat, ST_X(geom::geometry) for lon
    query = """
    SELECT place_id, ST_Y(geom::geometry) as lat, ST_X(geom::geometry) as lon
    FROM places
    WHERE (address IS NULL OR address = '')
      AND (metadata_json->>'address' IS NULL OR metadata_json->>'address' = '')
      AND geom IS NOT NULL
    LIMIT %s;
    """

    with conn.cursor() as cur:
        cur.execute(query, (args.limit,))
        rows = cur.fetchall()

    if not rows:
        logger.info("No places found with missing addresses.")
        return

    logger.info(f"Processing {len(rows)} places...")

    count = 0
    for place_id, lat, lon in rows:
        if google_key:
            address = reverse_geocode_google(lat, lon, google_key)
        else:
            try:
                address = reverse_geocode_nominatim(lat, lon)
            except Exception as e:
                if "429" in str(e):
                    logger.error("Rate limit hit (429)! Stopping script to avoid blocking your IP.")
                    break
                logger.warning(f"Error for {place_id}: {e}")
                address = None
            
            time.sleep(args.delay) # Nominatim requires delay

        if address:
            with conn.cursor() as cur:
                update_sql = """
                UPDATE places
                SET address = %s,
                    metadata_json = metadata_json || jsonb_build_object('address', %s),
                    last_updated = now()
                WHERE place_id = %s;
                """
                cur.execute(update_sql, (address, address, place_id))
                conn.commit()
            count += 1
            if count % args.batch_size == 0:
                logger.info(f"  Processed {count}/{len(rows)} places...")
        else:
            logger.warning(f"Could not find address for {place_id} at {lat}, {lon}")

    logger.info(f"Finished! Updated {count} addresses.")
    conn.close()

if __name__ == "__main__":
    main()
