import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

# Configuration
RAW_DATA_PATH = "data/project_c_samples.parquet"
CLEANED_DATA_PATH = "data/project_c_cleaned.parquet"
REFERENCE_DATE = datetime(2025, 2, 24)

def classify_broad_category(cat):
    """Groups high-cardinality categories into broad sectors."""
    if not isinstance(cat, str):
        return "other"
    
    cat = cat.lower()
    
    mapping = {
        'food_dining': ['restaurant', 'food', 'coffee', 'cafe', 'bakery', 'bar', 'pizza', 'mexican', 'american', 'fast_food', 'sandwich', 'ice_cream'],
        'hospitality': ['hotel', 'accommodation', 'resort', 'campground', 'bed_and_breakfast', 'hostel', 'motel'],
        'retail': ['shopping', 'store', 'market', 'discount', 'clothing', 'retail', 'gift', 'grocery', 'boutique', 'florist'],
        'services': ['professional_services', 'lawyer', 'event_planning', 'printing', 'real_estate', 'insurance', 'accounting', 'legal', 'logistic', 'storage'],
        'health_community': ['medical', 'dentist', 'doctor', 'hospital', 'pharmacy', 'church', 'clinic', 'day_care', 'preschool', 'school', 'health'],
        'automotive': ['auto', 'car', 'gas_station', 'tire', 'vehicle', 'parking'],
        'beauty_fitness': ['beauty', 'hair', 'salon', 'fitness', 'gym', 'spa', 'barber']
    }
    
    for broad, keywords in mapping.items():
        if any(kw in cat for kw in keywords):
            return broad
            
    return "other"

def prepare_data():
    print(f"Reading raw data from {RAW_DATA_PATH}...")
    if not os.path.exists(RAW_DATA_PATH):
        print(f"Error: {RAW_DATA_PATH} not found.")
        return

    df = pd.read_parquet(RAW_DATA_PATH)
    print(f"Loaded {len(df)} records.")

    # 1. Basic Cleaning
    # Drop columns that are entirely empty or not useful for modeling
    if 'emails' in df.columns and df['emails'].isnull().all():
        df = df.drop(columns=['emails'])

    # 2. Feature Extraction from Nested Structures
    print("Extracting features from nested columns...")

    # Names
    df['primary_name'] = df['names'].apply(lambda x: x.get('primary', '') if isinstance(x, dict) else '')
    df['name_length'] = df['primary_name'].str.len()

    # Categories
    df['primary_category'] = df['categories'].apply(lambda x: x.get('primary', 'unknown') if isinstance(x, dict) else 'unknown')
    df['broad_category'] = df['primary_category'].apply(classify_broad_category)

    # Presence Flags (Optimization: use binary integers)
    df['has_website'] = df['websites'].apply(lambda x: 1 if isinstance(x, (list, np.ndarray)) and len(x) > 0 else 0)
    df['has_social'] = df['socials'].apply(lambda x: 1 if isinstance(x, (list, np.ndarray)) and len(x) > 0 else 0)
    df['has_phone'] = df['phones'].apply(lambda x: 1 if isinstance(x, (list, np.ndarray)) and len(x) > 0 else 0)
    df['has_brand'] = df['brand'].apply(lambda x: 1 if x is not None and str(x).lower() not in ['none', 'nan', ''] else 0)
    
    # Addresses
    def process_address(x):
        if isinstance(x, list) and len(x) > 0:
            addr = x[0]
            if isinstance(addr, dict):
                return pd.Series([
                    1, 
                    addr.get('region', 'unknown'),
                    1 if addr.get('postcode') else 0
                ])
        return pd.Series([0, 'unknown', 0])

    addr_features = df['addresses'].apply(process_address)
    addr_features.columns = ['has_address', 'region', 'has_postcode']
    df = pd.concat([df, addr_features], axis=1)

    # Sources (Parsing logic from train_open_model.py)
    def analyze_sources(x):
        if not isinstance(x, (list, np.ndarray)) or len(x) == 0:
            return pd.Series([0, 0.0, 999.0]) # num_sources, mean_conf, days_since_update
        
        count = len(x)
        confidences = [s.get('confidence', 0) for s in x if isinstance(s, dict)]
        mean_conf = float(np.mean(confidences)) if confidences else 0.0
        
        min_days = 999.0
        for s in x:
            if isinstance(s, dict) and 'update_time' in s:
                try:
                    ts_str = s['update_time']
                    if 'T' in ts_str:
                        # Handle different iso formats
                        ts_str = ts_str.replace('Z', '+00:00')
                        dt = datetime.fromisoformat(ts_str)
                        dt = dt.replace(tzinfo=None)
                        days = (REFERENCE_DATE - dt).days
                        if days < min_days:
                            min_days = float(days)
                except Exception as e:
                    pass
        return pd.Series([float(count), mean_conf, min_days])

    print("Analyzing sources...")
    source_stats = df['sources'].apply(analyze_sources)
    source_stats.columns = ['num_sources', 'source_mean_confidence', 'days_since_last_update']
    df = pd.concat([df, source_stats], axis=1)

    # Fill NaNs for numerical features
    valid_dates = df[df['days_since_last_update'] < 900]['days_since_last_update']
    if not valid_dates.empty:
        fill_val = valid_dates.median()
    else:
        fill_val = 0.0
    df['days_since_last_update'] = df['days_since_last_update'].replace(999.0, fill_val)

    # 3. Final Selection
    # Keep flat columns, drop the complex ones to save space and avoid future parsing
    complex_cols = ['sources', 'names', 'categories', 'websites', 'socials', 'phones', 'brand', 'addresses', 'geometry', 'bbox']
    cleaned_df = df.drop(columns=[col for col in complex_cols if col in df.columns])

    print(f"Saving cleaned data to {CLEANED_DATA_PATH}...")
    cleaned_df.to_parquet(CLEANED_DATA_PATH, index=False)
    print("Done!")

if __name__ == "__main__":
    prepare_data()
