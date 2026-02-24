"""
Phase 3: Advanced Model Comparison & Optimization

Compares Random Forest, XGBoost, and LightGBM with:
- class_weight / scale_pos_weight for imbalanced data
- Stratified 5-fold cross-validation
- Threshold optimization for closed-class F1
- Additional engineered features
- Feature importance analysis

Saves the best model as open_model.pkl
"""

import json
import os
import sys
import warnings
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    precision_recall_curve, f1_score, make_scorer
)
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import lightgbm as lgb
import joblib

warnings.filterwarnings('ignore')

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)


# ============================================================================
# DATA LOADING (reuse from integrate_and_train.py)
# ============================================================================

def load_all_data():
    """Load and combine all data sources."""
    from scripts.integrate_and_train import (
        load_original_data, load_overture_data, load_osm_data,
        extract_features_original, extract_features_overture, extract_features_osm
    )
    
    original_df = load_original_data()
    overture_df = load_overture_data()
    osm_df = load_osm_data()
    
    dfs = []
    
    if len(original_df) > 0:
        dfs.append(extract_features_original(original_df))
    
    if len(overture_df) > 0:
        sample_size = min(len(overture_df), 5000)
        overture_sample = overture_df.sample(n=sample_size, random_state=42)
        dfs.append(extract_features_overture(overture_sample))
    
    if len(osm_df) > 0:
        dfs.append(extract_features_osm(osm_df))
    
    return pd.concat(dfs, ignore_index=True)


# ============================================================================
# ENHANCED FEATURE ENGINEERING
# ============================================================================

def engineer_features(df):
    """Add advanced features beyond the basic ones."""
    
    # Category encoding
    cat_freq = df['category'].value_counts(normalize=True).to_dict()
    df['category_freq_score'] = df['category'].map(cat_freq).fillna(0)
    
    le = LabelEncoder()
    df['category_label'] = le.fit_transform(df['category'].fillna('unknown'))
    
    # Composite: digital presence
    df['digital_presence'] = (
        df['has_website'] + df['has_social'] + df['has_phone'] + 
        df['has_email'] + df['has_brand']
    )
    
    # NEW: interaction features
    df['confidence_x_sources'] = df['confidence'] * df['num_sources']
    df['digital_x_confidence'] = df['digital_presence'] * df['confidence']
    df['sources_x_recency'] = df['num_sources'] / (df['days_since_last_update'] + 1)
    
    # NEW: ratio features
    df['web_to_social_ratio'] = df['num_websites'] / (df['num_socials'] + 1)
    df['phone_to_web_ratio'] = df['num_phones'] / (df['num_websites'] + 1)
    
    # NEW: metadata completeness score (0-1)
    df['metadata_completeness'] = (
        df['has_website'] * 0.2 + df['has_social'] * 0.15 + 
        df['has_phone'] * 0.2 + df['has_email'] * 0.1 + 
        df['has_brand'] * 0.15 + df['has_address'] * 0.1 +
        (df['num_sources'] > 1).astype(int) * 0.1
    )
    
    # NEW: staleness indicator (binary — is data older than 6 months?)
    df['is_stale'] = (df['days_since_last_update'] > 180).astype(int)
    
    # All feature columns for the model
    feature_cols = [
        # Basic presence
        'has_website', 'num_websites', 'has_social', 'num_socials',
        'has_phone', 'num_phones', 'has_email', 'has_brand', 'has_address',
        # Source & confidence
        'confidence', 'num_sources', 'source_mean_confidence',
        'days_since_last_update',
        # Name features
        'name_length', 'has_closure_keyword',
        # Category
        'category_freq_score', 'category_label',
        # Composite 
        'digital_presence', 'metadata_completeness',
        # Interaction features
        'confidence_x_sources', 'digital_x_confidence', 'sources_x_recency',
        # Ratio features
        'web_to_social_ratio', 'phone_to_web_ratio',
        # Binary indicators
        'is_stale',
    ]
    
    return df, feature_cols, le, cat_freq


# ============================================================================
# MODEL DEFINITIONS
# ============================================================================

def get_models(scale_ratio):
    """Define all models to compare. scale_ratio = n_open / n_closed."""
    models = {
        'RandomForest_balanced': RandomForestClassifier(
            n_estimators=300,
            max_depth=12,
            class_weight='balanced',
            random_state=42,
            n_jobs=-1,
            min_samples_leaf=5,
            min_samples_split=10
        ),
        'GradientBoosting': GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
            min_samples_leaf=10,
        ),
        'XGBoost': xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=scale_ratio,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            eval_metric='logloss',
            n_jobs=-1,
        ),
        'LightGBM': lgb.LGBMClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=scale_ratio,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            verbose=-1,
            n_jobs=-1,
        ),
    }
    return models


# ============================================================================
# EVALUATION
# ============================================================================

def find_optimal_threshold(y_true, y_proba_open):
    """Find the threshold that maximizes F1 for the closed class."""
    best_f1 = 0
    best_threshold = 0.5
    for t in np.arange(0.20, 0.80, 0.01):
        y_pred = (y_proba_open >= t).astype(int)
        f1_closed = f1_score(y_true, y_pred, pos_label=0)
        if f1_closed > best_f1:
            best_f1 = f1_closed
            best_threshold = t
    return best_threshold, best_f1


def evaluate_model(name, clf, X, y, skf):
    """Full evaluation of a single model with CV and threshold tuning."""
    print(f"\n{'─'*60}")
    print(f"  {name}")
    print(f"{'─'*60}")
    
    # Cross-validation metrics
    scoring = {
        'accuracy': 'accuracy',
        'f1_macro': 'f1_macro',
        'roc_auc': 'roc_auc',
        'recall_closed': make_scorer(lambda y, yp: f1_score(y, yp, pos_label=0))
    }
    
    cv_results = cross_validate(clf, X, y, cv=skf, scoring=scoring, n_jobs=-1)
    
    acc = cv_results['test_accuracy'].mean()
    f1m = cv_results['test_f1_macro'].mean()
    auc = cv_results['test_roc_auc'].mean()
    rc = cv_results['test_recall_closed'].mean()
    
    print(f"  CV Accuracy:       {acc:.4f} (+/- {cv_results['test_accuracy'].std():.4f})")
    print(f"  CV F1 Macro:       {f1m:.4f} (+/- {cv_results['test_f1_macro'].std():.4f})")
    print(f"  CV ROC-AUC:        {auc:.4f} (+/- {cv_results['test_roc_auc'].std():.4f})")
    print(f"  CV Closed-F1:      {rc:.4f} (+/- {cv_results['test_recall_closed'].std():.4f})")
    
    # Fit on full data for threshold optimization and feature importance
    clf.fit(X, y)
    
    if hasattr(clf, 'predict_proba'):
        y_proba = clf.predict_proba(X)[:, 1]
        opt_threshold, opt_f1 = find_optimal_threshold(y, y_proba)
        print(f"  Optimal Threshold: {opt_threshold:.2f} (Closed F1={opt_f1:.4f})")
    else:
        opt_threshold = 0.5
    
    # Full training set report with optimal threshold
    if hasattr(clf, 'predict_proba'):
        y_pred_opt = (y_proba >= opt_threshold).astype(int)
    else:
        y_pred_opt = clf.predict(X)
    
    print(f"\n  Classification Report (threshold={opt_threshold:.2f}):")
    print(classification_report(y, y_pred_opt, target_names=['CLOSED', 'OPEN'], digits=4))
    
    cm = confusion_matrix(y, y_pred_opt)
    print(f"  Confusion Matrix:")
    print(f"    {'':>10} Pred_CL  Pred_OP")
    print(f"    {'True_CL':>10}  {cm[0][0]:5d}    {cm[0][1]:5d}")
    print(f"    {'True_OP':>10}  {cm[1][0]:5d}    {cm[1][1]:5d}")
    
    return {
        'model': clf,
        'cv_accuracy': acc,
        'cv_f1_macro': f1m,
        'cv_roc_auc': auc,
        'cv_closed_f1': rc,
        'optimal_threshold': opt_threshold,
        'opt_closed_f1_train': opt_f1 if hasattr(clf, 'predict_proba') else 0,
    }


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("="*60)
    print("PHASE 3: ADVANCED MODEL COMPARISON")
    print("="*60)
    
    # Load data
    print("\n📦 Loading data...")
    combined = load_all_data()
    
    # Engineer features
    print("\n🔧 Engineering features...")
    combined, feature_cols, le, cat_freq = engineer_features(combined)
    
    X = combined[feature_cols].fillna(0)
    y = combined['open'].astype(int)
    
    print(f"  Dataset: {len(X)} samples, {len(feature_cols)} features")
    print(f"  Open: {(y==1).sum()} ({(y==1).mean()*100:.1f}%)")
    print(f"  Closed: {(y==0).sum()} ({(y==0).mean()*100:.1f}%)")
    
    # Class imbalance ratio
    scale_ratio = (y==1).sum() / (y==0).sum()
    print(f"  Imbalance ratio: {scale_ratio:.1f}:1")
    
    # Define models
    models = get_models(scale_ratio)
    
    # Evaluate all models
    print(f"\n{'='*60}")
    print("📊 MODEL COMPARISON (5-Fold Stratified CV)")
    print(f"{'='*60}")
    
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    results = {}
    for name, clf in models.items():
        results[name] = evaluate_model(name, clf, X, y, skf)
    
    # Summary table
    print(f"\n{'='*60}")
    print("📋 SUMMARY")
    print(f"{'='*60}")
    print(f"\n{'Model':<25} {'Accuracy':>10} {'F1-Macro':>10} {'ROC-AUC':>10} {'Closed-F1':>10} {'Threshold':>10}")
    print("─"*75)
    
    best_model_name = None
    best_f1 = 0
    
    for name, r in results.items():
        print(f"{name:<25} {r['cv_accuracy']:>10.4f} {r['cv_f1_macro']:>10.4f} {r['cv_roc_auc']:>10.4f} {r['cv_closed_f1']:>10.4f} {r['optimal_threshold']:>10.2f}")
        if r['cv_f1_macro'] > best_f1:
            best_f1 = r['cv_f1_macro']
            best_model_name = name
    
    print(f"\n🏆 Best model: {best_model_name} (F1-Macro: {best_f1:.4f})")
    
    # Feature importance from best model
    best = results[best_model_name]
    best_clf = best['model']
    
    print(f"\n{'='*60}")
    print(f"🔍 FEATURE IMPORTANCE ({best_model_name})")
    print(f"{'='*60}")
    
    if hasattr(best_clf, 'feature_importances_'):
        importances = pd.Series(best_clf.feature_importances_, index=feature_cols).sort_values(ascending=False)
        for feat, imp in importances.items():
            bar = '█' * int(imp * 50)
            print(f"  {feat:30s} {imp:.4f} {bar}")
    
    # Save the best model
    model_dir = os.path.join(PROJECT_ROOT, "stillopen", "backend", "model")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "open_model.pkl")
    
    joblib.dump({
        'model': best_clf,
        'model_name': best_model_name,
        'feature_names': feature_cols,
        'label_encoder': le,
        'category_freq': cat_freq,
        'optimal_threshold': best['optimal_threshold'],
        'training_samples': len(combined),
        'data_sources': ['original', 'overture', 'osm'],
        'cv_metrics': {
            'accuracy': best['cv_accuracy'],
            'f1_macro': best['cv_f1_macro'],
            'roc_auc': best['cv_roc_auc'],
            'closed_f1': best['cv_closed_f1'],
        }
    }, model_path)
    
    print(f"\n{'='*60}")
    print(f"✅ Best model ({best_model_name}) saved to {model_path}")
    print(f"   Threshold: {best['optimal_threshold']:.2f}")
    print(f"   CV ROC-AUC: {best['cv_roc_auc']:.4f}")
    print(f"   Training samples: {len(combined)}")
    print(f"{'='*60}")
