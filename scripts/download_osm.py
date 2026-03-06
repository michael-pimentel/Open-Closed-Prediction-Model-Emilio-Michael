"""
OSM Closed Business Downloader v3
Uses global node-only queries (faster than area scans) to get
businesses tagged as disused/closed in OpenStreetMap.
Also downloads open businesses from the same metro areas for balance.
"""

import json
import os
import ssl
import time
import urllib.request
import urllib.parse

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

OVERPASS_URL = "http://overpass-api.de/api/interpreter"
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def query_overpass(query_str, description=""):
    data = urllib.parse.urlencode({"data": query_str}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data)
    req.add_header("User-Agent", "StillOpenProject/1.0 (Academic)")
    try:
        with urllib.request.urlopen(req, timeout=120, context=ssl_ctx) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            elements = result.get("elements", [])
            print(f"  {description}: {len(elements)} elements")
            return elements
    except Exception as e:
        print(f"  {description}: ERROR - {e}")
        return []


def extract_place(element, is_closed=False):
    tags = element.get("tags", {})
    name = tags.get("name", tags.get("old_name", ""))
    if not name:
        return None
    
    lat = element.get("lat")
    lon = element.get("lon")
    if not lat and "center" in element:
        lat = element["center"].get("lat")
        lon = element["center"].get("lon")
    
    category = (
        tags.get("amenity") or tags.get("shop") or 
        tags.get("disused:amenity") or tags.get("disused:shop") or
        tags.get("closed:amenity") or tags.get("closed:shop") or "unknown"
    )
    
    addr_parts = []
    if tags.get("addr:street"):
        street = tags.get("addr:housenumber", "") + " " + tags["addr:street"]
        addr_parts.append(street.strip())
    if tags.get("addr:city"):
        addr_parts.append(tags["addr:city"])
    if tags.get("addr:state"):
        addr_parts.append(tags["addr:state"])
    address = ", ".join(addr_parts)
    
    websites = [tags[k] for k in ["website", "contact:website", "url"] if tags.get(k)]
    phones = [tags[k] for k in ["phone", "contact:phone"] if tags.get(k)]
    socials = [tags[k] for k in ["contact:facebook", "contact:instagram", "facebook"] if tags.get(k)]
    
    return {
        "id": f"osm_{element.get('id', '')}",
        "name": name,
        "category": category,
        "address": address,
        "lat": lat,
        "lon": lon,
        "open": 0 if is_closed else 1,
        "metadata": {
            "websites": websites,
            "phones": phones,
            "socials": socials,
            "categories": {"primary": category},
            "brand": {"names": {"primary": tags.get("brand", "")}} if tags.get("brand") else None,
            "confidence": 0.7 if address else 0.5,
            "open": 0 if is_closed else 1,
            "sources": [{"dataset": "osm", "record_id": str(element.get("id", ""))}],
        },
        "source": "osm"
    }


all_places = []

# Use compact bounding boxes for each city  — (south,west,north,east)
# Smaller = faster for Overpass
cities = [
    # Closed-business-focused queries with small bboxes
    ("NYC_c",   40.70, -74.02, 40.80, -73.93),
    ("LA_c",    33.95, -118.35, 34.10, -118.15),
    ("CHI_c",   41.85, -87.70, 41.93, -87.60),
    ("HOU_c",   29.72, -95.42, 29.80, -95.30),
    ("PHX_c",   33.42, -112.10, 33.50, -111.98),
    ("SF_c",    37.73, -122.44, 37.80, -122.38),
    ("SEA_c",   47.58, -122.38, 47.64, -122.28),
    ("MIA_c",   25.74, -80.25, 25.80, -80.17),
    ("DEN_c",   39.70, -105.00, 39.78, -104.90),
    ("ATL_c",   33.73, -84.42, 33.80, -84.35),
]

print("=== Downloading CLOSED businesses ===")
for name, s, w, n, e in cities:
    q = f"""
    [out:json][timeout:90][bbox:{s},{w},{n},{e}];
    (
      node["disused:amenity"];
      node["disused:shop"];
      node["closed:amenity"];
      node["closed:shop"];
      way["disused:amenity"];
      way["disused:shop"];
    );
    out center tags;
    """
    elements = query_overpass(q, name)
    for elem in elements:
        p = extract_place(elem, is_closed=True)
        if p:
            all_places.append(p)
    time.sleep(2)

closed_so_far = sum(1 for p in all_places if p["open"] == 0)
print(f"\nGot {closed_so_far} closed businesses total")

print("\n=== Downloading OPEN businesses ===")
open_cities = [
    ("NYC_o",   40.70, -74.02, 40.80, -73.93),
    ("LA_o",    33.95, -118.35, 34.10, -118.15),
    ("CHI_o",   41.85, -87.70, 41.93, -87.60),
    ("SF_o",    37.73, -122.44, 37.80, -122.38),
    ("SEA_o",   47.58, -122.38, 47.64, -122.28),
    ("DEN_o",   39.70, -105.00, 39.78, -104.90),
    ("ATL_o",   33.73, -84.42, 33.80, -84.35),
    ("BOS_o",   42.33, -71.10, 42.38, -71.03),
]

for name, s, w, n, e in open_cities:
    q = f"""
    [out:json][timeout:60][bbox:{s},{w},{n},{e}];
    (
      node["amenity"~"restaurant|cafe|bar|fast_food|bank|pharmacy"];
      node["shop"~"supermarket|convenience|bakery|electronics"];
    );
    out tags 500;
    """
    elements = query_overpass(q, name)
    for elem in elements:
        p = extract_place(elem, is_closed=False)
        if p:
            all_places.append(p)
    time.sleep(2)

# Save
output = os.path.join(DATA_DIR, "osm_places.json")
with open(output, "w") as f:
    json.dump(all_places, f, indent=2, default=str)

closed_count = sum(1 for p in all_places if p["open"] == 0)
open_count = sum(1 for p in all_places if p["open"] == 1)
print(f"\n✅ Total: {len(all_places)} ({closed_count} closed, {open_count} open)")
print(f"   Saved to {output}")
