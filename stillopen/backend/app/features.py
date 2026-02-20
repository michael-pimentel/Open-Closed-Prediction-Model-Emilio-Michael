import pandas as pd
import numpy as np
import json
import ast
from datetime import datetime

REFERENCE_DATE = datetime(2025, 2, 24)

def safe_parse_struct(x):
    if x is None:
        return None
    if isinstance(x, (list, dict)):
        return x
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, str):
        if 'array(' in x:
            x = x.replace("array(", "").replace(", dtype=object)", "").replace(")", "")
        try:
            return json.loads(x.replace("'", '"').replace("None", "null"))
        except:
            try:
                return ast.literal_eval(x)
            except:
                return None
    return None

def has_value(x):
    if x is None: return 0
    if isinstance(x, (int, float)): return 1
    if isinstance(x, (list, dict, np.ndarray)):
        return 1 if len(x) > 0 else 0
    s = str(x).strip()
    if s.lower() in ['none', 'null', 'nan', '', '[]', '{}']:
        return 0
    return 1

def count_items(x):
    """Count the number of items in a list/array field."""
    if x is None: return 0
    parsed = safe_parse_struct(x)
    if isinstance(parsed, (list, np.ndarray)):
        return len(parsed)
    return 0

def compute_features(record: dict, artifacts: dict = None) -> dict:
    """
    Compute all features for a single place record.
    Compatible with the unified model trained by integrate_and_train.py.
    """
    features = {}
    
    # 1. Binary Presence Features
    features['has_website'] = has_value(record.get('websites'))
    features['has_social'] = has_value(record.get('socials'))
    features['has_phone'] = has_value(record.get('phones'))
    features['has_address'] = has_value(record.get('addresses'))
    features['has_email'] = has_value(record.get('emails'))
    features['has_brand'] = has_value(record.get('brand'))
    
    # 2. Count Features (new)
    features['num_websites'] = count_items(record.get('websites'))
    features['num_socials'] = count_items(record.get('socials'))
    features['num_phones'] = count_items(record.get('phones'))
    
    # 3. Sources Analysis
    sources = record.get('sources')
    sources = safe_parse_struct(sources)
    
    num_sources = 0
    mean_conf = 0.0
    days_since_update = 365
    
    if sources and isinstance(sources, list):
        num_sources = len(sources)
        confidences = [s.get('confidence', 0) for s in sources if isinstance(s, dict)]
        if confidences:
            mean_conf = float(np.mean(confidences))
            
        min_days = 9999
        for s in sources:
            if isinstance(s, dict) and 'update_time' in s:
                try:
                    ts_str = s['update_time']
                    if 'T' in ts_str:
                        dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                        dt = dt.replace(tzinfo=None)
                        delta = (REFERENCE_DATE - dt).days
                        if delta < min_days:
                            min_days = delta
                except:
                    pass
        if min_days != 9999:
            days_since_update = min_days
            
    features['num_sources'] = num_sources
    features['source_mean_confidence'] = mean_conf
    features['days_since_last_update'] = days_since_update
    
    # 4. Category Features
    primary_category = 'unknown'
    cats = record.get('categories')
    cats = safe_parse_struct(cats)
    if isinstance(cats, dict):
        primary_category = cats.get('primary', 'unknown') or 'unknown'
        
    if artifacts:
        # Use the new category_freq map from training
        cat_freq = artifacts.get('category_freq', artifacts.get('freq_map', {}))
        le = artifacts.get('label_encoder', artifacts.get('le'))
        
        features['category_freq_score'] = cat_freq.get(primary_category, 0)
        
        if le:
            try:
                features['category_label'] = le.transform([primary_category])[0]
            except:
                features['category_label'] = 0 
        else:
            features['category_label'] = 0
    else:
        features['category_freq_score'] = 0
        features['category_label'] = 0
    
    # 5. Confidence
    features['confidence'] = float(record.get('confidence', 0))
    
    # 6. Name-based Features (new)
    name = ''
    names = record.get('names')
    if isinstance(names, dict):
        name = names.get('primary', '') or ''
    elif isinstance(names, str):
        name = names
    # Also check direct 'name' field
    if not name:
        name = record.get('name', '')
    
    features['name_length'] = len(name)
    
    name_lower = name.lower()
    features['has_closure_keyword'] = 1 if any(kw in name_lower for kw in [
        'closed', 'former', 'defunct', 'out of business', 'coming soon',
        'vacant', 'empty', 'available', 'for lease', 'for rent'
    ]) else 0
    
    # 7. Composite: Digital Presence Score (new)
    features['digital_presence'] = (
        features['has_website'] + features['has_social'] + features['has_phone'] +
        features['has_email'] + features['has_brand']
    )

    return features
