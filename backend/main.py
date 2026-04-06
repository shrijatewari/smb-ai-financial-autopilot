"""
Self-Learning Financial Control System for SMBs – FastAPI entrypoint.

Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any
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

# macOS: uvicorn/Cursor often starts without Homebrew on PATH – Tesseract lives in /opt/homebrew/bin.
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

from api.routes import (
    aa_routes,
    actions,
    bills_routes,
    alerts,
    assistant,
    auth,
    collections_routes,
    compliance,
    connect,
    credit_routes,
    dashboard,
    documents,
    gst_routes,
    growth_routes,
    insights_routes,
    inventory_routes,
    notification_routes,
    prediction,
    rl_routes,
    simulation,
    sms_commands,
    system,
    transactions,
    webhooks,
)
from db.prisma_client import connect_prisma, disconnect_prisma
from engine.system_engine import start as start_system_engine, stop as stop_system_engine

_briefing_scheduler: Any = None
_log = logging.getLogger(__name__)


async def _connect_prisma_with_retry() -> None:
    """Fly Postgres / network can lag right after deploy; block startup until DB accepts connections."""
    attempts = int(os.getenv("PRISMA_CONNECT_ATTEMPTS", "20"))
    base = float(os.getenv("PRISMA_CONNECT_DELAY_SEC", "2"))
    last: Exception | None = None
    for n in range(1, attempts + 1):
        try:
            await connect_prisma()
            if n > 1:
                _log.info("Prisma connected on attempt %s", n)
            return
        except Exception as e:
            last = e
            _log.warning("Prisma connect attempt %s/%s failed: %s", n, attempts, e)
            if n == attempts:
                break
            await asyncio.sleep(min(base * (2 ** (n - 1)), 30.0))
    if last is not None:
        raise last
    raise RuntimeError("Prisma connect failed with no exception recorded")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _briefing_scheduler
    await _connect_prisma_with_retry()
    start_system_engine()
    briefing_on = os.getenv("BRIEFING_ENABLED", "true").strip().lower() in ("1", "true", "yes")
    aa_refresh_on = os.getenv("AA_REFRESH_ENABLED", "true").strip().lower() in ("1", "true", "yes")
    ladder_on = os.getenv("COLLECTION_LADDER_ENABLED", "true").strip().lower() in ("1", "true", "yes")
    benchmark_on = os.getenv("BENCHMARK_CRON_ENABLED", "true").strip().lower() in ("1", "true", "yes")
    if briefing_on or aa_refresh_on or ladder_on or benchmark_on:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        _briefing_scheduler = AsyncIOScheduler(timezone="UTC")
        if briefing_on:
            from services.daily_briefing import send_daily_briefings

            # 8:00 AM India Standard Time (UTC+5:30) → 02:30 UTC
            _briefing_scheduler.add_job(
                send_daily_briefings,
                "cron",
                hour=2,
                minute=30,
                id="morning_whatsapp_briefing",
                replace_existing=True,
                misfire_grace_time=3600,
            )
        if aa_refresh_on:
            from services.aa_refresh import refresh_active_aa_consents

            _briefing_scheduler.add_job(
                refresh_active_aa_consents,
                "cron",
                hour=3,
                minute=0,
                id="aa_fi_refresh",
                replace_existing=True,
                misfire_grace_time=3600,
            )
        if ladder_on:
            from services.collection_ladder import run_collection_ladder_tick

            _briefing_scheduler.add_job(
                run_collection_ladder_tick,
                "interval",
                minutes=15,
                id="collection_ladder",
                replace_existing=True,
                misfire_grace_time=300,
            )
        if benchmark_on:
            from services.benchmark_service import refresh_benchmark_aggregates

            _briefing_scheduler.add_job(
                refresh_benchmark_aggregates,
                "cron",
                hour=4,
                minute=0,
                id="benchmark_refresh",
                replace_existing=True,
                misfire_grace_time=3600,
            )
        _briefing_scheduler.start()
    yield
    if _briefing_scheduler is not None:
        _briefing_scheduler.shutdown(wait=False)
        _briefing_scheduler = None
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
app.include_router(gst_routes.router, prefix="/gst", tags=["gst"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(aa_routes.router, prefix="/aa", tags=["account-aggregator"])
app.include_router(system.router, prefix="/system", tags=["system"])
app.include_router(sms_commands.router, prefix="/sms", tags=["sms"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(inventory_routes.router, prefix="/inventory", tags=["inventory"])
app.include_router(bills_routes.router, prefix="/bills", tags=["bills"])
app.include_router(notification_routes.router, prefix="/notifications", tags=["notifications"])
app.include_router(rl_routes.user_router, prefix="/user", tags=["rl"])
app.include_router(rl_routes.rl_router, prefix="/rl", tags=["rl"])
app.include_router(credit_routes.router, prefix="/credit", tags=["credit"])
app.include_router(growth_routes.router, prefix="/growth", tags=["growth"])
app.include_router(collections_routes.router, prefix="/collections", tags=["collections"])
app.include_router(insights_routes.router, prefix="/insights", tags=["insights"])

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
            "auth": "POST /auth/signup | /auth/login | GET /auth/me | PATCH /auth/me (settings incl. morning briefing)",
            "onboarding": "POST /onboarding",
            "connect_paytm": "POST /connect/paytm",
            "transactions_paytm": "GET /transactions/paytm",
            "transactions_csv": "POST /transactions/upload",
            "transactions_json": "POST /transactions/ingest/json",
            "prediction_cashflow": "GET /prediction/cashflow",
            "simulation": "GET /simulation/run",
            "decision": "GET /decision",
            "execute": "POST /execute/action | /execute/payment-link | /execute/whatsapp | /execute/collect | /execute/call",
            "transactions_sms": "POST /transactions/sms",
            "dashboard": "GET /dashboard",
            "compliance_gst": "GET /compliance/gst",
            "gst_summary": "GET /gst/summary (auth – GSTIN, liability, filing warning)",
            "transactions_ledger": "GET /transactions/ledger (persisted Prisma ledger; optional date_from, date_to, q, source, category, txn_type, sort, offset, limit)",
            "transactions_ledger_summary": "GET /transactions/ledger/summary (count + credit/debit/net; optional date range + q + source + category + txn_type)",
            "transactions_ledger_export": "GET /transactions/ledger/export (CSV download, auth; optional date range + q + source + category + txn_type + sort)",
            "notifications": "GET /notifications (auth – briefing & outbound notification log)",
            "alerts_fraud": "GET /alerts/fraud",
            "assistant": "POST /assistant/query | POST /assistant/query/audio",
            "assistant_media": "GET /media/assistant_tts/*.mp3 (TTS output)",
            "webhooks_whatsapp": "GET|POST /webhooks/whatsapp (Meta Cloud API – bot intents + assistant)",
            "webhooks_razorpay": "POST /webhooks/razorpay (payment.captured → ledger)",
            "system_state": "GET /system/state",
            "system_stream": "GET /system/stream (SSE, ~3s snapshot push)",
            "sms_commands": "POST /sms/commands (auth) – BAL, RISK, PAY",
            "documents_upload": "POST /documents/upload",
            "user_interaction": "POST /user/interaction (RL + module personalization)",
            "rl_feedback": "POST /rl/feedback",
            "rl_debug": "GET /rl/debug",
            "legacy_dashboard": "GET /v1/dashboard",
            "credit_score": "GET /credit/score?refresh= | GET /credit/history",
            "growth": "GET /growth/summary | POST /growth/subscription | GET /growth/benchmarks | POST /growth/benchmarks/refresh | GET /growth/audit",
            "collections_ladder": "GET /collections/customers | POST /collections/ladder/start | GET /collections/ladder",
            "insights_suppliers": "GET /insights/suppliers",
            "bills": "POST /bills/ingest-json | POST /bills/ingest-ocr | GET /bills/history | GET /bills/{id}/detail | GET /bills/{id}/file",
        },
    }
