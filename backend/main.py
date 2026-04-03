"""
Self-Learning Financial Control System for SMBs — FastAPI entrypoint.

Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv


def _prepend_to_path(bin_dir: str) -> None:
    """Put Homebrew / common UNIX bin dirs first so `tesseract` etc. resolve under Cursor/IDE."""
    if not bin_dir:
        return
    p = Path(bin_dir)
    if not p.is_dir():
        return
    resolved = str(p.resolve())
    current = os.environ.get("PATH", "")
    parts = [x for x in current.split(os.pathsep) if x]
    if resolved not in parts:
        os.environ["PATH"] = resolved + os.pathsep + current


# Load `backend/.env` before any module reads os.environ (DB URL, JWT, Razorpay, etc.)
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")

# macOS: uvicorn/Cursor often starts without Homebrew on PATH — Tesseract lives in /opt/homebrew/bin.
if sys.platform == "darwin":
    _prepend_to_path("/opt/homebrew/bin")
    _prepend_to_path("/usr/local/bin")

# Resolve relative paths for Google Cloud credentials (Vision OCR, etc.)
_gac = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
if _gac and not os.path.isabs(_gac):
    _p = (_backend_dir / _gac).resolve()
    if _p.is_file():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_p)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import actions, alerts, assistant, auth, compliance, connect, dashboard, documents, inventory_routes, prediction, rl_routes, simulation, system, transactions, webhooks
from db.prisma_client import connect_prisma, disconnect_prisma
from engine.system_engine import start as start_system_engine, stop as stop_system_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_prisma()
    start_system_engine()
    yield
    stop_system_engine()
    await disconnect_prisma()


app = FastAPI(
    title="Self-Learning Financial Control System for SMBs",
    description=(
        "Intelligent financial operating layer: ingestion, reconstruction, stochastic cash simulation, "
        "credit risk, automated treasury actions, and execution adapters."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(prediction.router, prefix="/prediction", tags=["prediction"])
app.include_router(simulation.router, prefix="/simulation", tags=["simulation"])
app.include_router(actions.router_decision, prefix="/decision", tags=["decisions"])
app.include_router(actions.router_execute, prefix="/execute", tags=["execution"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(connect.router, prefix="/connect", tags=["connect"])
app.include_router(compliance.router, prefix="/compliance", tags=["compliance"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(system.router, prefix="/system", tags=["system"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(inventory_routes.router, prefix="/inventory", tags=["inventory"])
app.include_router(rl_routes.user_router, prefix="/user", tags=["rl"])
app.include_router(rl_routes.rl_router, prefix="/rl", tags=["rl"])

# Legacy integrations (Streamlit / prior clients)
from routes import dashboard as legacy_dashboard
from routes import intelligence, onboarding, upload as legacy_upload

app.include_router(legacy_upload.router)
app.include_router(onboarding.router)
app.include_router(intelligence.router)
app.include_router(legacy_dashboard.router, prefix="/v1", tags=["legacy-dashboard"])

app.add_api_route(
    "/ingest/sms",
    intelligence.ingest_sms,
    methods=["POST"],
    tags=["legacy"],
)

_media_root = _backend_dir / "media"
_media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media_root)), name="media")


@app.get("/health")
def health():
    return {"status": "operational", "service": "financial_control_plane"}


@app.get("/")
def root():
    return {
        "service": "Self-Learning Financial Control System for SMBs",
        "version": "2.0.0",
        "documentation": "/docs",
        "endpoints": {
            "auth": "POST /auth/signup | /auth/login | GET /auth/me",
            "onboarding": "POST /onboarding",
            "connect_paytm": "POST /connect/paytm",
            "transactions_paytm": "GET /transactions/paytm",
            "transactions_csv": "POST /transactions/upload",
            "transactions_json": "POST /transactions/ingest/json",
            "prediction_cashflow": "GET /prediction/cashflow",
            "simulation": "GET /simulation/run",
            "decision": "GET /decision",
            "execute": "POST /execute/action | /execute/payment-link | /execute/whatsapp | /execute/call",
            "transactions_sms": "POST /transactions/sms",
            "dashboard": "GET /dashboard",
            "compliance_gst": "GET /compliance/gst",
            "alerts_fraud": "GET /alerts/fraud",
            "assistant": "POST /assistant/query | POST /assistant/query/audio",
            "assistant_media": "GET /media/assistant_tts/*.mp3 (TTS output)",
            "webhooks_whatsapp": "GET|POST /webhooks/whatsapp (Meta Cloud API)",
            "system_state": "GET /system/state",
            "documents_upload": "POST /documents/upload",
            "user_interaction": "POST /user/interaction (RL + module personalization)",
            "rl_feedback": "POST /rl/feedback",
            "rl_debug": "GET /rl/debug",
            "legacy_dashboard": "GET /v1/dashboard",
        },
    }
