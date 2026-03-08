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

    def _build_explanation(self, status: str, features_dict: dict) -> list:
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
        return explanation

    def predict(self, place_data: dict):
        # Single-record predict — delegates to batch for consistency
        results = self.predict_batch([place_data])
        return results[0]

    def predict_batch(self, place_data_list: list) -> list:
        """
        Predict for multiple places in one model call.

        Decision logic:
        - Default assumption: OPEN (0.60 confidence).
        - Only predict CLOSED when at least one explicit hard signal is present:
            1. website_status == "likely_closed"  (dead domain / 404)
            2. Name contains an explicit closure keyword
            3. OSM disused:* / closed:* / end_date tag present
            4. open == 0 flag in source data  (fast-path, handled before model)
            5. Model closed_prob > 0.80  (post-retrain, only fires on genuine signals)
        - Absence of website / phone / social is NOT evidence of closure.
        """
        results = [None] * len(place_data_list)
        model_indices = []
        model_features = []

        feature_cols = self.artifacts.get('feature_names',
                       self.artifacts.get('features', [])) if self.artifacts else []

        for i, place_data in enumerate(place_data_list):
            if not isinstance(place_data, dict):
                place_data = {}

            # Fast path: explicit ground-truth label open=0
            explicit_open = place_data.get('open')
            if explicit_open is not None:
                try:
                    if int(explicit_open) == 0:
                        results[i] = {
                            "status": "closed",
                            "confidence": 0.90,
                            "explanation": [
                                "Data source indicates this place is permanently closed.",
                            ],
                        }
                        continue
                except (ValueError, TypeError):
                    pass

            try:
                fd = compute_features(place_data, self.artifacts)
            except Exception as e:
                print(f"Feature computation error: {e}")
                results[i] = {"status": "open", "confidence": None, "explanation": []}
                continue

            model_indices.append(i)
            model_features.append((place_data, fd))

        if model_features:
            # Run batch model inference once
            all_fds = [fd for _, fd in model_features]
            df_batch = pd.DataFrame(all_fds)
            if feature_cols:
                for c in feature_cols:
                    if c not in df_batch.columns:
                        df_batch[c] = 0
                df_batch = df_batch[feature_cols]

            probas = None
            if self.model and hasattr(self.model, "predict_proba"):
                try:
                    probas = self.model.predict_proba(df_batch)
                except Exception as e:
                    print(f"Batch prediction error: {e}")

            for batch_i, (result_idx, (place_data, fd)) in enumerate(
                zip(model_indices, model_features)
            ):
                # Always use the real model output. None means model failed to load.
                open_prob = float(probas[batch_i][1]) if probas is not None else None
                closed_prob = (1.0 - open_prob) if open_prob is not None else None

                # ── Hard signal checks ────────────────────────────────────────
                # Signal 1: verified dead website
                has_dead_website = place_data.get("website_status") == "likely_closed"
                # Signal 2: closure keyword in name (already computed in features)
                has_closure_name = bool(fd.get("has_closure_keyword", 0))
                # Signal 3: OSM disused / end_date tags
                has_osm_closure = bool(
                    place_data.get("disused:amenity") or place_data.get("disused:shop") or
                    place_data.get("closed:amenity") or place_data.get("closed:shop") or
                    place_data.get("end_date")
                )

                hard_signals = sum([has_dead_website, has_closure_name, has_osm_closure])

                if hard_signals >= 1:
                    # At least one explicit closure signal — predict closed.
                    confidence = closed_prob if closed_prob is not None else 0.70
                    status = "closed"
                    prediction_type = "closed"
                elif closed_prob is not None and closed_prob > 0.90:
                    # Signal 5: model very confident — fires only on genuine signals
                    # with the conservative {0:1, 1:10} class weights.
                    status, confidence = "closed", closed_prob
                    prediction_type = "closed"
                else:
                    status = "open"
                    if open_prob is not None and open_prob > 0.60:
                        # Positive signals in the data — surface the real probability.
                        confidence = open_prob
                        prediction_type = "open"
                    else:
                        # Sparse record: no closure signals, but also no strong open
                        # signals. Default to likely-open with null confidence so the
                        # UI knows not to show a percentage.
                        confidence = None
                        prediction_type = "likely_open"

                results[result_idx] = {
                    "status": status,
                    "confidence": confidence,
                    "prediction_type": prediction_type,
                    "explanation": self._build_explanation(status, fd),
                }

        return results

model_service = ModelService()

def predict_status(place) -> dict:
    place_data = place.metadata_json if hasattr(place, 'metadata_json') else place
    if not isinstance(place_data, dict):
        place_data = {}
    return model_service.predict(place_data)

def predict_place(place_data) -> dict:
    return predict_status(place_data)

def predict_batch(place_data_list: list) -> list:
    """Batch predict for a list of place metadata dicts."""
    return model_service.predict_batch(place_data_list)
