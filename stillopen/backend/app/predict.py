import joblib
import pandas as pd
import os
from .features import compute_features

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")
MODEL_PATH = os.path.join(MODEL_DIR, "open_model.pkl")

class ModelService:
    def __init__(self):
        self.model = None
        self.artifacts = None
        self.threshold = 0.5  # Default, overridden by trained optimal
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            print(f"Loading model from {MODEL_PATH}...")
            loaded = joblib.load(MODEL_PATH)
            if isinstance(loaded, dict):
                self.model = loaded['model']
                self.artifacts = loaded
                self.threshold = loaded.get('optimal_threshold', 0.5)
                n = loaded.get('training_samples', '?')
                sources = loaded.get('data_sources', [])
                print(f"  Model loaded: {n} training samples from {sources}")
                print(f"  Optimal threshold: {self.threshold:.2f}")
            else:
                self.model = loaded
                self.artifacts = {}
        else:
            print(f"Model not found at {MODEL_PATH}! Predictions will be mocks.")
            self.model = None

    def predict(self, place_data: dict):
        # Compute features using the updated feature pipeline
        features_dict = compute_features(place_data, self.artifacts)
        
        status = "unknown"
        confidence = 0.0
        
        if not self.model:
            status = "open"
            confidence = 0.82
        else:
            # Get feature column order from the model artifacts
            feature_cols = self.artifacts.get('feature_names', 
                           self.artifacts.get('features', []))
            
            df_input = pd.DataFrame([features_dict])
            
            if feature_cols:
                for c in feature_cols:
                    if c not in df_input.columns:
                        df_input[c] = 0
                df_input = df_input[feature_cols]

            # Get probability prediction
            if hasattr(self.model, "predict_proba"):
                try:
                    proba = self.model.predict_proba(df_input)[0]
                    # proba[1] = probability of being OPEN (class 1)
                    open_prob = float(proba[1])
                    
                    # Use optimized threshold
                    if open_prob >= self.threshold:
                        status = "open"
                        confidence = open_prob
                    else:
                        status = "closed"
                        confidence = 1.0 - open_prob
                except Exception:
                    prediction_cls = self.model.predict(df_input)[0]
                    status = "open" if prediction_cls == 1 else "closed"
                    confidence = 0.5
            else:
                prediction_cls = self.model.predict(df_input)[0]
                status = "open" if prediction_cls == 1 else "closed"
                confidence = 0.5

        # Generate explanation signals
        explanation = []
        if status == "open":
            explanation.append("Model predicts this place is likely still in business.")
        else:
            explanation.append("Model predicts this place may be permanently closed.")
            
        if features_dict.get('has_website'):
            explanation.append("Website is active.")
        else:
            explanation.append("No website detected.")
            
        if features_dict.get('has_social'):
            explanation.append("Social media presence detected.")
            
        if features_dict.get('has_phone'):
            explanation.append("Phone number on file.")
            
        if features_dict.get('num_sources', 0) > 2:
            explanation.append(f"Confirmed by {features_dict['num_sources']} data sources.")
        elif features_dict.get('num_sources', 0) == 1:
            explanation.append("Only 1 data source available.")
            
        if features_dict.get('days_since_last_update', 999) < 90:
            explanation.append("Recent data updates found.")
        elif features_dict.get('days_since_last_update', 999) > 365:
            explanation.append("Data may be stale (no recent updates).")
        
        return {
            "status": status,
            "confidence": confidence,
            "explanation": explanation
        }

model_service = ModelService()

def predict_place(place_data: dict):
    return model_service.predict(place_data)
