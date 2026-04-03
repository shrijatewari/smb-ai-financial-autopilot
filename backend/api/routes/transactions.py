"""Transaction ingestion: CSV, JSON arrays, SMS payloads, Paytm mock feed."""

from __future__ import annotations

from datetime import datetime, timedelta
import random

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from prisma.models import User
from services import ingestion_service, state_store
from utils.sms_parser import parse_sms_batch

router = APIRouter()


class TransactionRowIn(BaseModel):
    amount: float
    type: str
    timestamp: datetime | None = None
    source: str = "api"
    description: str | None = None


class JsonIngestBody(BaseModel):
    transactions: list[TransactionRowIn] = Field(..., min_length=1)


class SmsMessageBody(BaseModel):
    """Single SMS line or paste (bank / UPI)."""

    message: str = Field(..., min_length=3, max_length=8000)


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Ingest CSV from bank or Paytm export.

    Supports strict columns `date, amount, type, description` or common layouts:
    `Value Date`, `Narration`, `Debit`, `Credit`, etc. (see `services/csv_flexible`).
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Expected a .csv file")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        df, summary = ingestion_service.ingest_upload(raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    preview = (
        df[["date", "amount", "type", "description", "source"]]
        .head(8)
        .to_dict(orient="records")
    )
    return {
        "status": "ingested",
        "rows_persisted": summary["rows"],
        "total_amount_signed": summary["total_amount_signed"],
        "preview": preview,
    }


@router.post("/ingest/json")
def ingest_json(body: JsonIngestBody):
    """Ingest structured JSON transactions into the active ledger."""
    rows = []
    for t in body.transactions:
        rows.append(
            {
                "date": (t.timestamp or datetime.utcnow()).strftime("%Y-%m-%d"),
                "amount": abs(t.amount),
                "type": t.type,
                "description": t.description or "",
                "source": t.source,
            }
        )
    src = [r["source"] for r in rows]
    df = pd.DataFrame([{k: v for k, v in r.items() if k != "source"} for r in rows])
    df = ingestion_service.validate_and_normalize(df)
    df["source"] = src
    cur = ingestion_service.get_session_dataframe()
    if cur is None:
        ingestion_service.set_session_dataframe(df)
    else:
        if "source" not in cur.columns:
            cur["source"] = "csv"
        merged = pd.concat([cur, df], ignore_index=True)
        ingestion_service.set_session_dataframe(merged)
    ingestion_service.sync_source_mix_from_df(ingestion_service.get_session_dataframe())
    return {"status": "ingested", "rows_added": len(df)}


def _mock_paytm_rows(account: str) -> list[dict]:
    """Realistic UPI / merchant settlement style rows."""
    rng = random.Random(hash(account) % (2**32))
    base = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
    out: list[dict] = []
    for i in range(18):
        ts = base - timedelta(days=i // 3, hours=rng.randint(0, 11))
        amt = round(rng.choice([120, 450, 890, 1500, 3200, 499, 2100]) + rng.random() * 50, 2)
        typ = rng.choice(["credit", "credit", "debit"])
        out.append(
            {
                "id": f"PTM-{account[-6:]}-{i:04d}",
                "timestamp": ts.isoformat() + "Z",
                "amount": amt if typ == "credit" else -amt,
                "type": typ,
                "description": rng.choice(
                    ["UPI received", "Settlement", "QR payment", "Refund", "Wallet top-up"]
                ),
                "source": "paytm",
            }
        )
    return out


@router.get("/paytm")
def get_paytm_transactions(user: User = Depends(get_current_user)):
    """Mock Paytm ledger after simulated OAuth."""
    st = state_store.get_paytm_state(user.id)
    if not st or st.get("status") != "connected":
        raise HTTPException(
            status_code=400,
            detail="Paytm not connected. POST /connect/paytm first.",
        )
    account = str(st.get("account", "merchant"))
    return {
        "status": "ok",
        "account": account,
        "transactions": _mock_paytm_rows(account),
    }


@router.post("/sms")
def post_sms_message(body: SmsMessageBody):
    """
    Parse one or more SMS-style lines (UPI / bank alerts) and append to the session ledger.

    Example body: `{"message": "₹500 received from Rahul via UPI"}`
    """
    parsed = parse_sms_batch(body.message)
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="No transactions parsed — include an amount (₹500 / Rs 500) and credit/debit cues.",
        )
    n = ingestion_service.append_parsed_transactions(parsed, source="sms")
    return {
        "status": "ingested",
        "rows_appended": n,
        "parsed": [
            {
                "amount": float(r["amount"]),
                "type": r["type"],
                "date": r["date"],
                "description": r.get("description", "")[:200],
            }
            for r in parsed
        ],
    }


@router.post("/ingest/sms")
def ingest_sms(payload: dict):
    """Legacy: `{"text": "..."}` — same parser as POST /transactions/sms."""
    text = str(payload.get("text") or payload.get("message") or "")
    parsed = parse_sms_batch(text)
    if not parsed:
        raise HTTPException(status_code=422, detail="No transactions parsed from SMS payload")
    n = ingestion_service.append_parsed_transactions(parsed, source="sms")
    return {"status": "ingested", "rows_appended": n}
