import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Dual-mode database: PostgreSQL for production, SQLite for local development
# Set DATABASE_URL env var for PostgreSQL, otherwise defaults to SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", None)

IS_POSTGRES = DATABASE_URL is not None and "postgresql" in DATABASE_URL

if not DATABASE_URL:
    # Default to SQLite for local development
    db_path = os.path.join(os.path.dirname(__file__), "..", "stillopen.db")
    DATABASE_URL = f"sqlite:///{os.path.abspath(db_path)}"

if IS_POSTGRES:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=0,
        pool_pre_ping=True
    )
else:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
