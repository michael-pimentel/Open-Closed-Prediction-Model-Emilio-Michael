"""
Unified Data Integration & Retraining Pipeline

Combines data from three sources:
1. Original project dataset (data/project_c_samples.parquet) 
2. Overture Maps US data (scripts/data/overture_places_us.parquet)
3. OSM closed/open businesses (scripts/data/osm_places.json)

Normalizes all data into a unified feature format, then trains an improved model.
"""

import json
import os
import sys
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    precision_recall_curve, f1_score
)
import joblib

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# ============================================================================
# STEP 1: LOAD ALL DATA SOURCES
# ============================================================================

def load_original_data():
    """Load the original Overture-sourced dataset with ground truth labels."""
    path = os.path.join(PROJECT_ROOT, "data", "project_c_samples.parquet")
    if not os.path.exists(path):
        print("  ✗ Original data not found")
        return pd.DataFrame()
    
    df = pd.read_parquet(path)
    print(f"  ✓ Original: {len(df)} records ({(df['open']==1).sum()} open, {(df['open']==0).sum()} closed)")
    return df


def load_overture_data():
    """Load Overture Maps US data (all labeled 'open')."""
    path = os.path.join(PROJECT_ROOT, "scripts", "data", "overture_places_us.parquet")
    if not os.path.exists(path):
        print("  ✗ Overture data not found")
        return pd.DataFrame()
    
    df = pd.read_parquet(path)
    # All records from Overture are operational (operating_status = 'open')
    df['open'] = 1
    print(f"  ✓ Overture: {len(df)} records (all open)")
    return df


def load_osm_data():
    """Load OSM closed/open businesses."""
    path = os.path.join(PROJECT_ROOT, "scripts", "data", "osm_places.json")
    if not os.path.exists(path):
        print("  ✗ OSM data not found")
        return pd.DataFrame()
    
    with open(path) as f:
        data = json.load(f)
    
    df = pd.DataFrame(data)
    closed = (df['open'] == 0).sum()
    opened = (df['open'] == 1).sum()
    print(f"  ✓ OSM: {len(df)} records ({opened} open, {closed} closed)")
    return df


# ============================================================================
# STEP 2: UNIFIED FEATURE ENGINEERING
# ============================================================================

def extract_features_original(df):
    """Extract features from the original parquet data (nested structs)."""
    records = []
    for _, row in df.iterrows():
        # Parse nested fields
        names = row.get('names', {})
        if isinstance(names, dict):
            name = names.get('primary', 'Unknown') or 'Unknown'
        else:
            name = 'Unknown'
        
        cats = row.get('categories', {})
        if isinstance(cats, dict):
            category = cats.get('primary', 'unknown') or 'unknown'
        else:
            category = 'unknown'
        
        # Feature extraction
        websites = row.get('websites')
        has_website = 1 if websites is not None and (
            (isinstance(websites, (list, np.ndarray)) and len(websites) > 0)
        ) else 0
        num_websites = len(websites) if isinstance(websites, (list, np.ndarray)) else 0
        
        socials = row.get('socials')
        has_social = 1 if socials is not None and (
            (isinstance(socials, (list, np.ndarray)) and len(socials) > 0)
        ) else 0
        num_socials = len(socials) if isinstance(socials, (list, np.ndarray)) else 0
        
        phones = row.get('phones')
        has_phone = 1 if phones is not None and (
            (isinstance(phones, (list, np.ndarray)) and len(phones) > 0)
        ) else 0
        num_phones = len(phones) if isinstance(phones, (list, np.ndarray)) else 0
        
        emails = row.get('emails')
        has_email = 1 if emails is not None and (
            (isinstance(emails, (list, np.ndarray)) and len(emails) > 0)
        ) else 0
        
        brand = row.get('brand')
        has_brand = 1 if brand is not None and brand != {} else 0
        
        addresses = row.get('addresses')
        has_address = 1 if addresses is not None and (
            (isinstance(addresses, (list, np.ndarray)) and len(addresses) > 0)
        ) else 0
        
        confidence = float(row.get('confidence', 0))
        
        # Source analysis
        sources = row.get('sources')
        num_sources = 0
        source_mean_confidence = 0
        days_since_last_update = 365
        if isinstance(sources, (list, np.ndarray)) and len(sources) > 0:
            num_sources = len(sources)
            confs = []
            for s in sources:
                if isinstance(s, dict) and s.get('confidence') is not None:
                    confs.append(float(s['confidence']))
            if confs:
                source_mean_confidence = np.mean(confs)
            
            # Extract last update time
            for s in sources:
                if isinstance(s, dict) and s.get('update_time'):
                    try:
                        from datetime import datetime
                        ut = pd.to_datetime(str(s['update_time']))
                        days = (datetime.now() - ut).days
                        days_since_last_update = min(days_since_last_update, max(0, days))
                    except:
                        pass
        
        # Name-based features
        name_lower = name.lower()
        name_length = len(name)
        has_closure_keyword = 1 if any(kw in name_lower for kw in [
            'closed', 'former', 'defunct', 'out of business', 'coming soon',
            'vacant', 'empty', 'available', 'for lease', 'for rent'
        ]) else 0
        
        records.append({
            'name': name,
            'category': category,
            'has_website': has_website,
            'num_websites': num_websites,
            'has_social': has_social,
            'num_socials': num_socials,
            'has_phone': has_phone,
            'num_phones': num_phones,
            'has_email': has_email,
            'has_brand': has_brand,
            'has_address': has_address,
            'confidence': confidence,
            'num_sources': num_sources,
            'source_mean_confidence': source_mean_confidence,
            'days_since_last_update': days_since_last_update,
            'name_length': name_length,
            'has_closure_keyword': has_closure_keyword,
            'open': int(row.get('open', 1)),
            'data_source': 'original'
        })
    
    return pd.DataFrame(records)


def extract_features_overture(df):
    """Extract features from Overture Maps parquet data."""
    records = []
    for _, row in df.iterrows():
        names = row.get('names')
        if isinstance(names, dict):
            name = names.get('primary', 'Unknown') or 'Unknown'
        else:
            name = 'Unknown'
        
        cats = row.get('categories')
        if isinstance(cats, dict):
            category = cats.get('primary', 'unknown') or 'unknown'
        else:
            category = 'unknown'
        
        websites = row.get('websites')
        has_website = 1 if websites is not None and (
            isinstance(websites, (list, np.ndarray)) and len(websites) > 0
        ) else 0
        num_websites = len(websites) if isinstance(websites, (list, np.ndarray)) else 0
        
        socials = row.get('socials')
        has_social = 1 if socials is not None and (
            isinstance(socials, (list, np.ndarray)) and len(socials) > 0
        ) else 0
        num_socials = len(socials) if isinstance(socials, (list, np.ndarray)) else 0
        
        phones = row.get('phones')
        has_phone = 1 if phones is not None and (
            isinstance(phones, (list, np.ndarray)) and len(phones) > 0
        ) else 0
        num_phones = len(phones) if isinstance(phones, (list, np.ndarray)) else 0
        
        emails = row.get('emails')
        has_email = 1 if emails is not None and (
            isinstance(emails, (list, np.ndarray)) and len(emails) > 0
        ) else 0
        
        brand = row.get('brand')
        has_brand = 1 if brand is not None and brand != {} else 0
        
        addresses = row.get('addresses')
        has_address = 1 if addresses is not None and (
            isinstance(addresses, (list, np.ndarray)) and len(addresses) > 0
        ) else 0
        
        confidence = float(row.get('confidence', 0))
        
        sources = row.get('sources')
        num_sources = 0
        source_mean_confidence = 0
        days_since_last_update = 365
        if isinstance(sources, (list, np.ndarray)) and len(sources) > 0:
            num_sources = len(sources)
            confs = []
            for s in sources:
                if isinstance(s, dict) and s.get('confidence') is not None:
                    confs.append(float(s['confidence']))
            if confs:
                source_mean_confidence = np.mean(confs)
        
        name_lower = name.lower()
        name_length = len(name)
        has_closure_keyword = 1 if any(kw in name_lower for kw in [
            'closed', 'former', 'defunct', 'out of business', 'coming soon',
            'vacant', 'empty', 'available', 'for lease', 'for rent'
        ]) else 0
        
        records.append({
            'name': name,
            'category': category,
            'has_website': has_website,
            'num_websites': num_websites,
            'has_social': has_social,
            'num_socials': num_socials,
            'has_phone': has_phone,
            'num_phones': num_phones,
            'has_email': has_email,
            'has_brand': has_brand,
            'has_address': has_address,
            'confidence': confidence,
            'num_sources': num_sources,
            'source_mean_confidence': source_mean_confidence,
            'days_since_last_update': days_since_last_update,
            'name_length': name_length,
            'has_closure_keyword': has_closure_keyword,
            'open': int(row.get('open', 1)),
            'data_source': 'overture'
        })
    
    return pd.DataFrame(records)


def extract_features_osm(df):
    """Extract features from OSM data (already flat JSON)."""
    records = []
    for _, row in df.iterrows():
        metadata = row.get('metadata', {})
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        
        name = row.get('name', 'Unknown')
        category = row.get('category', 'unknown')
        
        websites = metadata.get('websites', [])
        phones = metadata.get('phones', [])
        socials = metadata.get('socials', [])
        
        name_lower = name.lower()
        has_closure_keyword = 1 if any(kw in name_lower for kw in [
            'closed', 'former', 'defunct', 'out of business', 'coming soon',
            'vacant', 'empty', 'available', 'for lease', 'for rent'
        ]) else 0
        
        records.append({
            'name': name,
            'category': category,
            'has_website': 1 if len(websites) > 0 else 0,
            'num_websites': len(websites),
            'has_social': 1 if len(socials) > 0 else 0,
            'num_socials': len(socials),
            'has_phone': 1 if len(phones) > 0 else 0,
            'num_phones': len(phones),
            'has_email': 0,
            'has_brand': 1 if metadata.get('brand') else 0,
            'has_address': 1 if row.get('address', '') else 0,
            'confidence': float(metadata.get('confidence', 0.5)),
            'num_sources': 1,
            'source_mean_confidence': float(metadata.get('confidence', 0.5)),
            'days_since_last_update': 180,  # Approximate for OSM
            'name_length': len(name),
            'has_closure_keyword': has_closure_keyword,
            'open': int(row.get('open', 1)),
            'data_source': 'osm'
        })
    
    return pd.DataFrame(records)


# ============================================================================
# STEP 3: TRAINING PIPELINE
# ============================================================================

def train_model(df):
    """Train an improved Random Forest model with the combined dataset."""
    
    # Category encoding
    cat_freq = df['category'].value_counts(normalize=True).to_dict()
    df['category_freq_score'] = df['category'].map(cat_freq).fillna(0)
    
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    df['category_label'] = le.fit_transform(df['category'].fillna('unknown'))
    
    # Digital presence score (composite feature)
    df['digital_presence'] = (
        df['has_website'] + df['has_social'] + df['has_phone'] + 
        df['has_email'] + df['has_brand']
    )
    
    # Feature list 
    feature_cols = [
        'has_website', 'num_websites', 'has_social', 'num_socials',
        'has_phone', 'num_phones', 'has_email', 'has_brand', 'has_address',
        'confidence', 'num_sources', 'source_mean_confidence',
        'days_since_last_update', 'name_length', 'has_closure_keyword',
        'category_freq_score', 'category_label', 'digital_presence'
    ]
    
    X = df[feature_cols].fillna(0)
    y = df['open'].astype(int)
    
    print(f"\n{'='*60}")
    print(f"TRAINING DATA SUMMARY")
    print(f"{'='*60}")
    print(f"  Total records: {len(X)}")
    print(f"  Open (1): {(y==1).sum()} ({(y==1).mean()*100:.1f}%)")
    print(f"  Closed (0): {(y==0).sum()} ({(y==0).mean()*100:.1f}%)")
    
    by_source = df.groupby('data_source')['open'].agg(['count', 'mean'])
    print(f"\n  By source:")
    for source, row in by_source.iterrows():
        print(f"    {source}: {int(row['count'])} records ({row['mean']*100:.1f}% open)")
    
    print(f"\n  Features ({len(feature_cols)}):")
    for feat in feature_cols:
        print(f"    {feat}")
    
    # Random Forest with class_weight='balanced'
    print(f"\n{'='*60}")
    print("TRAINING RANDOM FOREST")
    print(f"{'='*60}")
    
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1,
        min_samples_leaf=5,
        min_samples_split=10
    )
    
    # Stratified 5-fold cross-validation 
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    accuracies = cross_val_score(clf, X, y, cv=skf, scoring='accuracy')
    f1_scores = cross_val_score(clf, X, y, cv=skf, scoring='f1_macro')
    roc_scores = cross_val_score(clf, X, y, cv=skf, scoring='roc_auc')
    
    print(f"\n  5-Fold CV Results:")
    print(f"    Accuracy:  {accuracies.mean():.4f} (+/- {accuracies.std():.4f})")
    print(f"    F1 Macro:  {f1_scores.mean():.4f} (+/- {f1_scores.std():.4f})")
    print(f"    ROC-AUC:   {roc_scores.mean():.4f} (+/- {roc_scores.std():.4f})")
    
    # Train on full dataset for final model
    clf.fit(X, y)
    
    # Classification report on training data (for reference)
    y_pred = clf.predict(X)
    print(f"\n  Full Training Set Report:")
    print(classification_report(y, y_pred, target_names=['CLOSED', 'OPEN']))
    
    # Feature importances
    importances = pd.Series(clf.feature_importances_, index=feature_cols).sort_values(ascending=False)
    print(f"  Feature Importance:")
    for feat, imp in importances.items():
        bar = '█' * int(imp * 50)
        print(f"    {feat:30s} {imp:.4f} {bar}")
    
    # Threshold optimization
    y_proba = clf.predict_proba(X)[:, 1]
    precisions, recalls, thresholds = precision_recall_curve(y, y_proba, pos_label=0)
    
    # Find optimal threshold for F1 on closed class
    best_f1 = 0
    best_threshold = 0.5
    for t in np.arange(0.3, 0.7, 0.01):
        y_t = (y_proba < t).astype(int)  # Below threshold = predict closed
        y_t = 1 - y_t  # Flip: 0 = closed, 1 = open
        f1 = f1_score(y, y_t, pos_label=0)
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = t
    
    print(f"\n  Optimal threshold for closed-class F1: {best_threshold:.2f} (F1={best_f1:.4f})")
    
    return clf, feature_cols, le, cat_freq, best_threshold


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print(f"{'='*60}")
    print("LOADING DATA SOURCES")
    print(f"{'='*60}")
    
    original_df = load_original_data()
    overture_df = load_overture_data()
    osm_df = load_osm_data()
    
    print(f"\n{'='*60}")
    print("EXTRACTING FEATURES")
    print(f"{'='*60}")
    
    dfs = []
    
    if len(original_df) > 0:
        print("  Processing original data...")
        feat_orig = extract_features_original(original_df)
        dfs.append(feat_orig)
        print(f"    → {len(feat_orig)} records")
    
    if len(overture_df) > 0:
        # Sample Overture data to avoid overwhelming the training set with open examples
        # Since all are open, take a random sample proportional to our needs
        sample_size = min(len(overture_df), 5000)  # Cap at 5K open examples from Overture
        overture_sample = overture_df.sample(n=sample_size, random_state=42)
        print(f"  Processing Overture data (sampled {sample_size} from {len(overture_df)})...")
        feat_overture = extract_features_overture(overture_sample)
        dfs.append(feat_overture)
        print(f"    → {len(feat_overture)} records")
    
    if len(osm_df) > 0:
        print("  Processing OSM data...")
        feat_osm = extract_features_osm(osm_df)
        dfs.append(feat_osm)
        print(f"    → {len(feat_osm)} records")
    
    # Combine all sources
    combined = pd.concat(dfs, ignore_index=True)
    print(f"\n  Combined dataset: {len(combined)} records")
    print(f"  Open: {(combined['open']==1).sum()}, Closed: {(combined['open']==0).sum()}")
    
    # Train model
    clf, feature_cols, le, cat_freq, threshold = train_model(combined)
    
    # Save model
    model_dir = os.path.join(PROJECT_ROOT, "stillopen", "backend", "model")
    os.makedirs(model_dir, exist_ok=True)
    
    model_path = os.path.join(model_dir, "open_model.pkl")
    joblib.dump({
        'model': clf,
        'feature_names': feature_cols,
        'label_encoder': le,
        'category_freq': cat_freq,
        'optimal_threshold': threshold,
        'training_samples': len(combined),
        'data_sources': ['original', 'overture', 'osm'],
    }, model_path)
    
    print(f"\n{'='*60}")
    print(f"✅ Model saved to {model_path}")
    print(f"   Training samples: {len(combined)}")
    print(f"   Optimal threshold: {threshold:.2f}")
    print(f"{'='*60}")
