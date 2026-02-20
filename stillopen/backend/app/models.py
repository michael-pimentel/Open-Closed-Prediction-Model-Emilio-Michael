from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, BigInteger
from sqlalchemy.sql import func
from .database import Base, IS_POSTGRES

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
# Conditional imports for PostgreSQL-specific types
if IS_POSTGRES:
    from sqlalchemy.dialects.postgresql import JSONB
    from geoalchemy2 import Geometry

    class Place(Base):
        """
        Production POI table with PostGIS geometry and JSONB metadata.
        Used when DATABASE_URL points to PostgreSQL.
        """
        __tablename__ = "places"

        id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
        place_id = Column(String, unique=True, index=True, nullable=False)
        name = Column(String, index=True, nullable=False)
        category = Column(String, index=True, nullable=True)
        address = Column(String, nullable=True)
        source = Column(String, nullable=False, default="osm")
        geom = Column(
            Geometry(geometry_type='POINT', srid=4326, spatial_index=True),
            nullable=True
        )
        metadata_json = Column(JSONB, nullable=True)
        last_updated = Column(DateTime, server_default=func.now())
else:
    class Place(Base):
        """
        Local development POI table using standard SQLite-compatible types.
        Used when no DATABASE_URL is set.
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
        metadata_json = Column(Text, nullable=True)  # JSON string for SQLite
        last_updated = Column(DateTime, server_default=func.now())
