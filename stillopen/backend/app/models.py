from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON
from sqlalchemy.sql import func
from .database import Base

# --- Pydantic API Schemas ---
class PlacePredictRequest(BaseModel):
    place_id: str

class SearchResult(BaseModel):
    id: str
    name: str
    address: str
    status: str
    confidence: float

class PlaceDetail(BaseModel):
    id: str
    name: str
    address: str
    status: str
    confidence: float
    explanation: List[str]

# --- SQLAlchemy Database Models ---
class Place(Base):
    """
    Core POI table. Uses JSON for metadata storage.
    Compatible with both SQLite (local dev) and PostgreSQL (production).
    """
    __tablename__ = "places"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    place_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    category = Column(String, index=True, nullable=True)
    address = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    source = Column(String, nullable=False, default="overture")
    metadata_json = Column(Text, nullable=True)  # Store as JSON string for SQLite compat
    last_updated = Column(DateTime, server_default=func.now())
