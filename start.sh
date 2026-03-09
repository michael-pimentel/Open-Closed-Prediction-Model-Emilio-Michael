#!/usr/bin/env bash
# Start the StillOpen backend (FastAPI → Supabase) and frontend (Next.js)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/stillopen/backend"
FRONTEND="$ROOT/stillopen/frontend"

# ── Backend ──────────────────────────────────────────────────────────────────
echo "Starting backend on http://localhost:8000 ..."
(
  cd "$BACKEND"
  source venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "Starting frontend on http://localhost:3000 ..."
(
  cd "$FRONTEND"
  npm run dev
) &
FRONTEND_PID=$!

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."

# Shut down both on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
