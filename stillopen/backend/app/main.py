from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from .models import SearchResult, PlaceDetail
from .search import search_places, get_place_metadata, load_data_to_db
from .predict import predict_place

app = FastAPI(title="StillOpen API")

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    load_data_to_db()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/search", response_model=List[SearchResult])
def search(q: str):
    if not q:
        return []
    return search_places(q, limit=5)

@app.get("/place/{place_id}", response_model=PlaceDetail)
def get_place_details(place_id: str):
    metadata = get_place_metadata(place_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Place not found")
    
    # Run prediction to get status/confidence
    prediction_result = predict_place(metadata)
    
    return {
        "id": place_id,
        "name": metadata.get('name', 'Unknown'),
        "address": f"{metadata.get('city', '')}, {metadata.get('state', '')}".strip(", "),
        "status": prediction_result['status'],
        "confidence": prediction_result['confidence'],
        "explanation": prediction_result['explanation']
    }
