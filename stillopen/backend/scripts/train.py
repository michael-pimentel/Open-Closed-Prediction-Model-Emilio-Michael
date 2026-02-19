import pandas as pd
import numpy as np
import json
import ast
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import joblib
import warnings
import os

warnings.filterwarnings('ignore')

# ---------------------------------------------------------
# CONSTANTS & CONFIG
# ---------------------------------------------------------
REFERENCE_DATE = datetime(2025, 2, 24)

# ---------------------------------------------------------
# DATA LOADING & UTILS
# ---------------------------------------------------------

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

def preprocess_data(df):
    print("Feature Engineering started...")
    
    if 'open' not in df.columns:
        raise ValueError("Target column 'open' not found in dataset")
    df = df.dropna(subset=['open']).copy()
    
    # Simple features
    df['has_website'] = df['websites'].apply(has_value)
    df['has_social'] = df['socials'].apply(has_value)
    df['has_phone'] = df['phones'].apply(has_value)
    df['has_address'] = df['addresses'].apply(has_value)
    df['has_email'] = df['emails'].apply(has_value)
    df['has_brand'] = df['brand'].apply(has_value)

    # Sources
    def analyze_sources(x):
        sources = safe_parse_struct(x)
        if not sources or not isinstance(sources, list):
            return pd.Series([0, 0, 9999]) 
        
        count = len(sources)
        confidences = [s.get('confidence', 0) for s in sources if isinstance(s, dict)]
        mean_conf = np.mean(confidences) if confidences else 0
        min_days = 9999
        for s in sources:
            if isinstance(s, dict) and 'update_time' in s:
                try:
                    ts_str = s['update_time']
                    if 'T' in ts_str:
                        dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                        dt = dt.replace(tzinfo=None)
                        days = (REFERENCE_DATE - dt).days
                        if days < min_days:
                            min_days = days
                except:
                    pass
        return pd.Series([count, mean_conf, min_days])

    print("  Processing 'sources'...")
    source_stats = df['sources'].apply(analyze_sources)
    source_stats.columns = ['num_sources', 'source_mean_confidence', 'days_since_last_update']
    df = pd.concat([df, source_stats], axis=1)

    mean_days = df[df['days_since_last_update'] != 9999]['days_since_last_update'].mean()
    if pd.isna(mean_days): mean_days = 365 # Default fallback
    df['days_since_last_update'] = df['days_since_last_update'].replace(9999, mean_days).fillna(mean_days)

    # Category
    def get_primary_category(x):
        cat = safe_parse_struct(x)
        if isinstance(cat, dict):
            return cat.get('primary', 'unknown')
        return 'unknown'

    df['primary_category'] = df['categories'].apply(get_primary_category)
    
    freq_map = df['primary_category'].value_counts(normalize=True).to_dict()
    df['category_freq_score'] = df['primary_category'].map(freq_map)
    
    le = LabelEncoder()
    # Simplified handling for label encoder: fit on top 50, others 'other'
    top_cats = df['primary_category'].value_counts().head(50).index
    df['category_label'] = df['primary_category'].apply(lambda c: c if c in top_cats else 'other')
    df['category_label'] = le.fit_transform(df['category_label'])

    feature_cols = [
        'confidence', 
        'has_website', 'has_social', 'has_phone', 'has_address', 'has_email', 'has_brand',
        'num_sources', 'source_mean_confidence', 'days_since_last_update',
        'category_freq_score', 'category_label'
    ]
    
    df[feature_cols] = df[feature_cols].fillna(0)
    
    return df, feature_cols, freq_map, le, top_cats

def train_and_save():
    print("Loading data...")
    # Adjust path to where script is run from or relative
    # If running from project root:
    data_path = "data/project_c_samples.parquet"
    if not os.path.exists(data_path):
        # Try relative to script if run inside scripts folder
        data_path = "../../data/project_c_samples.parquet"
        
    if not os.path.exists(data_path):
        print(f"Data not found at {data_path}")
        return

    df = pd.read_parquet(data_path)
    
    df_processed, feature_cols, freq_map, le, top_cats = preprocess_data(df)
    
    X = df_processed[feature_cols]
    y = df_processed['open'].astype(int)
    
    print("Training Random Forest...")
    rf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced')
    rf.fit(X, y)
    
    # Save artifacts
    artifacts = {
        'model': rf,
        'features': feature_cols,
        'freq_map': freq_map,
        'le': le,
        'top_cats': list(top_cats)
    }
    
    output_path = "stillopen/backend/model/open_model.pkl"
    # Ensure dir exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"Saving model to {output_path}...")
    joblib.dump(artifacts, output_path)
    print("Done.")

if __name__ == "__main__":
    train_and_save()
