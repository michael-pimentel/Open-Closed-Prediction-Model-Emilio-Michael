import json
import os
import pandas as pd
import numpy as np
from sqlalchemy import text
from .database import engine, Base
from .models import Place
from .predict import predict_place

def load_data_to_db():
    """
    Seeds the SQLite database from the parquet dataset.
    Skips if the database already has data.
    """
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Check if already seeded
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM places")).fetchone()
        if result[0] > 0:
            print(f"Database already seeded with {result[0]} records. Skipping.")
            return
    
    # Locate parquet data
    data_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "project_c_samples.parquet")
    data_path = os.path.normpath(data_path)
    
    if not os.path.exists(data_path):
        # Try alternate path
        data_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "project_c_samples.parquet")
        data_path = os.path.normpath(data_path)
    
    if not os.path.exists(data_path):
        print(f"Warning: Parquet data not found at {data_path}. Database will be empty.")
        return
    
    print(f"Seeding database from {data_path}...")
    df = pd.read_parquet(data_path)
    
    records = []
    for idx, row in df.iterrows():
        # Extract the primary name
        names = row.get('names')
        name = 'Unknown'
        if isinstance(names, dict):
            name = names.get('primary', 'Unknown') or 'Unknown'
        
        # Extract category
        cats = row.get('categories')
        category = 'unknown'
        if isinstance(cats, dict):
            category = cats.get('primary', 'unknown') or 'unknown'
        
        # Extract address
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
        
        # Build metadata dict matching what the model expects
        metadata = {}
        for col in ['websites', 'socials', 'emails', 'phones', 'brand', 'addresses', 'sources', 'categories']:
            val = row.get(col)
            if val is not None:
                if isinstance(val, np.ndarray):
                    val = val.tolist()
                metadata[col] = val
        metadata['confidence'] = float(row.get('confidence', 0))
        metadata['open'] = int(row.get('open', 1))
        
        # Store city/state from address for display
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
            'lat': None,
            'lon': None,
            'source': 'overture',
            'metadata_json': json.dumps(metadata, default=str),
        })
    
    # Bulk insert
    with engine.begin() as conn:
        from sqlalchemy import insert
        conn.execute(insert(Place), records)
    
    print(f"Seeded {len(records)} places into the database.")


def search_places(query: str, limit: int = 20):
    """
    Search places using SQLite LIKE matching.
    For production with PostgreSQL, this should use pg_trgm for fuzzy matching.
    """
    if not query or len(query.strip()) < 2:
        return []

    with engine.connect() as conn:
        try:
            sql = text("""
                SELECT place_id, name, address, lat, lon, metadata_json
                FROM places 
                WHERE name LIKE :ilike_query 
                   OR category LIKE :ilike_query
                ORDER BY 
                    CASE WHEN LOWER(name) = LOWER(:exact_query) THEN 0
                         WHEN LOWER(name) LIKE LOWER(:start_query) THEN 1
                         ELSE 2 END,
                    name
                LIMIT :limit
            """)
            
            results = conn.execute(sql, {
                "ilike_query": f"%{query}%",
                "exact_query": query,
                "start_query": f"{query}%",
                "limit": limit
            }).fetchall()
            
            out = []
            for row in results:
                place_id = row.place_id
                name = row.name
                address = row.address or "Unknown Location"
                
                # Parse metadata for prediction
                metadata = {}
                if row.metadata_json:
                    try:
                        metadata = json.loads(row.metadata_json)
                    except:
                        pass
                
                # Run prediction
                try:
                    pred = predict_place(metadata)
                    status = pred.get('status', 'unknown')
                    confidence = pred.get('confidence', 0.0)
                except Exception:
                    status = 'unknown'
                    confidence = 0.0

                out.append({
                    "id": str(place_id),
                    "name": name,
                    "address": address,
                    "status": status,
                    "confidence": confidence
                })
            
            return out
        except Exception as e:
            print(f"Search error: {e}")
            return []


def get_place_metadata(place_id: str):
    """
    Look up a place's metadata by its place_id.
    """
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
            print(f"Query Error: {e}")
            return None
