import os
import logging
from typing import Optional
from geopy.geocoders import Nominatim, GoogleV3
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

logger = logging.getLogger("app.utils")

def build_address(metadata: dict) -> str:
    """
    Compose a human-readable address from OSM addr:* fields or a plain 'address' field.
    """
    # If a pre-built full address exists, use it directly
    if metadata.get("address"):
        return metadata["address"].strip()
    if metadata.get("full_address"):
        return metadata["full_address"].strip()
        
    parts = []

    # Street-level: number + street
    house = (metadata.get("addr:housenumber") or "").strip()
    street = (metadata.get("addr:street") or "").strip()
    if house and street:
        parts.append(f"{house} {street}")
    elif street:
        parts.append(street)

    # City / municipality
    city = (
        metadata.get("addr:city")
        or metadata.get("addr:municipality")
        or metadata.get("city")
        or ""
    ).strip()
    if city:
        parts.append(city)

    # State / province
    state = (metadata.get("addr:state") or metadata.get("state") or "").strip()
    if state:
        parts.append(state)

    # Postcode
    postcode = str(metadata.get("addr:postcode") or metadata.get("postcode") or "").strip()
    if postcode:
        parts.append(postcode)

    return ", ".join(parts) if parts else ""

import time

_LAST_429_TIME = 0
_COOLDOWN_PERIOD = 300  # 5 minutes

def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """
    Reverse geocode coordinates to an address using Nominatim or Google.
    Includes a cooldown period after hitting a 429 error.
    """
    global _LAST_429_TIME
    
    # Check cooldown
    if time.time() - _LAST_429_TIME < _COOLDOWN_PERIOD:
        return None

    google_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    
    if google_key:
        geolocator = GoogleV3(api_key=google_key)
        try:
            location = geolocator.reverse((lat, lon), timeout=10)
            return location.address if location else None
        except (GeocoderTimedOut, GeocoderServiceError) :
            return None
    
    # Fallback to Nominatim
    geolocator = Nominatim(user_agent="stillopen_app")
    try:
        location = geolocator.reverse((lat, lon), timeout=3)
        return location.address if location else None
    except GeocoderServiceError as e:
        if "429" in str(e):
            logger.warning("Nominatim rate limit hit (429). Entering cooldown.")
            _LAST_429_TIME = time.time()
        return None
    except Exception:
        return None
