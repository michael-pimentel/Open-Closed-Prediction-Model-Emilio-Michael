# StillOpen

A production-ready full-stack web application that predicts whether a business is likely OPEN or CLOSED using a machine learning model trained on geospatial metadata.

## 🏗 Architecture

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: FastAPI, Python 3.10+, SQLite, Scikit-learn
- **ML Model**: Random Forest (served via joblib)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+

### 1. Backend Setup

```bash
cd stillopen/backend
# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the API
uvicorn app.main:app --reload
```
The API will run at `http://localhost:8000`.
On first run, it will:
1. Seed the SQLite database from `data/project_c_samples.parquet` (ensure this file exists relative to backend).
2. Load the ML model from `model/open_model.pkl`.

### 2. Frontend Setup

Open a new terminal:
```bash
cd stillopen/frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```
The frontend will run at `http://localhost:3000`.

## 📁 Project Structure

```
stillopen/
├── backend/
│   ├── app/
│   │   ├── main.py       # API Entry point
│   │   ├── predict.py    # Inference logic
│   │   ├── features.py   # Feature engineering pipeline
│   │   ├── search.py     # Search & Database logic
│   │   └── database.py   # SQLite setup
│   ├── model/            # Saved ML models
│   └── scripts/          # Training scripts
├── frontend/
│   ├── app/              # Next.js App Router
│   ├── components/       # Reusable UI components
│   └── public/
```

## 🧠 Model Training

To retrain the model:
```bash
cd stillopen
python3 backend/scripts/train.py
```

## 🌍 Deployment

### Frontend (Vercel)
1. Push to GitHub.
2. Import project in Vercel.
3. Set Environment Variable: `NEXT_PUBLIC_API_URL` to your backend URL.

### Backend (Render/Fly.io)
1. Dockerize the backend (Dockerfile not included but standard Python setup).
2. Deploy as a web service.
3. Ensure `project_c_samples.parquet` is available or database is pre-seeded.

