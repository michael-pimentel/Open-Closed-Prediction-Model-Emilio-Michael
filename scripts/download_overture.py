"""
Overture Maps Data Downloader v2
Downloads US-focused places data with operating_status from the latest Overture release.
Also grabs the 'open' field used in original dataset if available.
"""

import duckdb
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

OUTPUT_FILE = os.path.join(DATA_DIR, "overture_places_us.parquet")

RELEASE = "2026-02-18.0"
S3_PATH = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"

print(f"Connecting to Overture Maps release {RELEASE}...")

con = duckdb.connect()
con.execute("INSTALL httpfs;")
con.execute("LOAD httpfs;")
con.execute("SET s3_region='us-west-2';")
con.execute("SET s3_access_key_id='';")
con.execute("SET s3_secret_access_key='';")

# Step 1: Check all available columns
print("\n--- Full schema ---")
schema = con.execute(f"""
    DESCRIBE SELECT * FROM read_parquet('{S3_PATH}', filename=true, hive_partitioning=true) LIMIT 1
""").fetchall()
col_names = [row[0] for row in schema]
for row in schema:
    print(f"  {row[0]}: {row[1]}")

# Step 2: Check if operating_status exists in the data
has_operating_status = 'operating_status' in col_names
print(f"\nHas operating_status column: {has_operating_status}")

# Step 3: Download US places with all metadata
# Select columns that exist
select_cols = [
    "id", "names", "categories", "confidence", "websites", "socials", 
    "emails", "phones", "brand", "addresses", "sources"
]
if has_operating_status:
    select_cols.append("operating_status")

select_str = ", ".join(select_cols)

print(f"\n--- Downloading US places data ---")
print("Filtering for country = 'US', limit 50,000...")

query = f"""
COPY (
    SELECT {select_str}
    FROM read_parquet('{S3_PATH}', filename=true, hive_partitioning=true)
    WHERE 
        addresses IS NOT NULL 
        AND len(addresses) > 0
        AND addresses[1].country = 'US'
    LIMIT 50000
) TO '{OUTPUT_FILE}' (FORMAT PARQUET);
"""

try:
    con.execute(query)
    count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{OUTPUT_FILE}')").fetchone()[0]
    print(f"\n✅ Downloaded {count} US records to {OUTPUT_FILE}")
    
    # Check operating_status distribution
    if has_operating_status:
        print("\n--- operating_status distribution ---")
        dist = con.execute(f"""
            SELECT operating_status, COUNT(*) as cnt 
            FROM read_parquet('{OUTPUT_FILE}') 
            GROUP BY operating_status 
            ORDER BY cnt DESC
        """).fetchall()
        for row in dist:
            print(f"  {row[0]}: {row[1]}")
    
    # Check metadata coverage
    print("\n--- Metadata coverage ---")
    result = con.execute(f"""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN websites IS NOT NULL AND len(websites) > 0 THEN 1 ELSE 0 END) as has_websites,
            SUM(CASE WHEN socials IS NOT NULL AND len(socials) > 0 THEN 1 ELSE 0 END) as has_socials,
            SUM(CASE WHEN phones IS NOT NULL AND len(phones) > 0 THEN 1 ELSE 0 END) as has_phones
        FROM read_parquet('{OUTPUT_FILE}')
    """).fetchone()
    print(f"  Total: {result[0]}")
    print(f"  Has websites: {result[1]} ({result[1]/result[0]*100:.1f}%)")
    print(f"  Has socials: {result[2]} ({result[2]/result[0]*100:.1f}%)")
    print(f"  Has phones: {result[3]} ({result[3]/result[0]*100:.1f}%)")
    
    # Sample
    print("\n--- Sample data ---")
    sample = con.execute(f"""
        SELECT id, names.primary as name, categories.primary as category, confidence
        FROM read_parquet('{OUTPUT_FILE}') 
        LIMIT 5
    """).fetchall()
    for row in sample:
        print(f"  {row[1]} | {row[2]} | conf: {row[3]:.3f}")
        
except Exception as e:
    print(f"Error: {e}")

con.close()
print("\nDone.")
