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

def compute_features(record: dict, artifacts: dict = None) -> dict:
    # record is a dictionary representing a single place
    
    # 1. Basic Presence Features
    features = {}
    features['has_website'] = has_value(record.get('websites'))
    features['has_social'] = has_value(record.get('socials'))
    features['has_phone'] = has_value(record.get('phones'))
    features['has_address'] = has_value(record.get('addresses'))
    features['has_email'] = has_value(record.get('emails'))
    features['has_brand'] = has_value(record.get('brand'))
    
    # 2. Sources Analysis
    sources = record.get('sources')
    sources = safe_parse_struct(sources)
    
    num_sources = 0
    mean_conf = 0.0
    days_since_update = 365 # Default
    
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
    
    # 3. Category Features
    primary_category = 'unknown'
    cats = record.get('categories')
    cats = safe_parse_struct(cats)
    if isinstance(cats, dict):
        primary_category = cats.get('primary', 'unknown')
        
    # Apply artifacts if available
    if artifacts:
        freq_map = artifacts.get('freq_map', {})
        le = artifacts.get('le')
        top_cats = artifacts.get('top_cats', [])
        
        features['category_freq_score'] = freq_map.get(primary_category, 0)
        
        cat_for_label = primary_category if primary_category in top_cats else 'other'
        if le:
            try:
                # Basic check to avoid error if label unseen in le but handled by 'other' logic
                features['category_label'] = le.transform([cat_for_label])[0]
            except:
                 features['category_label'] = 0 
        else:
             features['category_label'] = 0
    else:
        features['category_freq_score'] = 0
        features['category_label'] = 0
    
    # Pass through confidence
    features['confidence'] = record.get('confidence', 0)

    return features
