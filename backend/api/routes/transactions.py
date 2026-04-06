"""Transaction ingestion: CSV, JSON arrays, SMS payloads, Paytm mock feed."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta, timezone
import random

import pandas as pd
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from engine.system_engine import refresh_snapshot
from services import ingestion_service, state_store
from utils.sms_parser import parse_sms_batch

router = APIRouter()


def _parse_ledger_date_param(name: str, raw: str | None) -> date | None:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"{name} must be YYYY-MM-DD") from e


def _parse_ledger_q_param(raw: str | None) -> str | None:
    """Optional case-insensitive substring on `description` (max 200 chars)."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if len(s) > 200:
        raise HTTPException(status_code=422, detail="q must be at most 200 characters")
    return s


def _parse_ledger_source_param(raw: str | None) -> str | None:
    """Optional exact `source` column match (VarChar 32); case-insensitive via Prisma / SQL."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if len(s) > 32:
        raise HTTPException(status_code=422, detail="source must be at most 32 characters")
    return s


def _parse_ledger_category_param(raw: str | None) -> str | None:
    """Improvement 16 – optional exact `category` column match (VarChar 32)."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if len(s) > 32:
        raise HTTPException(status_code=422, detail="category must be at most 32 characters")
    return s


def _parse_ledger_txn_type_param(raw: str | None) -> str | None:
    """Optional credit | debit filter on `txn_type` / DB `type` column."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip().lower()
    if s not in ("credit", "debit"):
        raise HTTPException(status_code=422, detail="txn_type must be credit or debit")
    return s


def _parse_ledger_sort_param(raw: str | None) -> str:
    """Improvement 15 – optional sort for ledger list + CSV (default: newest by time)."""
    if not raw or not str(raw).strip():
        return "date_desc"
    s = str(raw).strip().lower()
    if s not in ("date_desc", "date_asc", "amount_desc", "amount_asc"):
        raise HTTPException(
            status_code=422,
            detail="sort must be one of: date_desc, date_asc, amount_desc, amount_asc",
        )
    return s


def _ledger_order_by(sort_key: str):
    """Prisma `order` for `LedgerTransaction.find_many` (tie-break on time for amount sorts)."""
    if sort_key == "date_desc":
        return {"occurred_at": "desc"}
    if sort_key == "date_asc":
        return {"occurred_at": "asc"}
    if sort_key == "amount_desc":
        return [{"amount": "desc"}, {"occurred_at": "desc"}]
    if sort_key == "amount_asc":
        return [{"amount": "asc"}, {"occurred_at": "asc"}]
    return {"occurred_at": "desc"}


def _ledger_where(
    user_id: int,
    d_from: date | None,
    d_to: date | None,
    search: str | None = None,
    source: str | None = None,
    txn_type: str | None = None,
    category: str | None = None,
) -> dict:
    where: dict = {"user_id": user_id}
    if d_from is not None or d_to is not None:
        filt: dict = {}
        if d_from is not None:
            filt["gte"] = datetime.combine(d_from, time.min, tzinfo=timezone.utc)
        if d_to is not None:
            filt["lte"] = datetime.combine(d_to, time(23, 59, 59, 999999), tzinfo=timezone.utc)
        where["occurred_at"] = filt
    if search:
        where["description"] = {"contains": search, "mode": "insensitive"}
    if source:
        where["source"] = {"equals": source, "mode": "insensitive"}
    if txn_type:
        where["txn_type"] = {"equals": txn_type, "mode": "insensitive"}
    if category:
        where["category"] = {"equals": category, "mode": "insensitive"}
    return where


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


@router.get("/ledger/export")
async def export_persisted_ledger_csv(
    user: User = Depends(get_current_user),
    limit: int = Query(10_000, ge=1, le=50_000),
    date_from: str | None = Query(None, description="Inclusive start date (YYYY-MM-DD, UTC day bounds)."),
    date_to: str | None = Query(None, description="Inclusive end date (YYYY-MM-DD, UTC day bounds)."),
    q: str | None = Query(None, description="Case-insensitive substring match on description (max 200 chars)."),
    source: str | None = Query(None, description="Exact ledger source (e.g. razorpay_webhook, max 32 chars)."),
    txn_type: str | None = Query(None, description="credit or debit – filter by ledger row type."),
    sort: str | None = Query(None, description="date_desc | date_asc | amount_desc | amount_asc (default date_desc)."),
    category: str | None = Query(None, description="Exact ledger category (max 32 chars, case-insensitive)."),
):
    """
    Download persisted `LedgerTransaction` rows as CSV (UTF-8, Excel-friendly BOM).
    Columns: id, date, description, amount_signed, type, source, category, confidence, occurred_at_iso.
    Optional `date_from` / `date_to` / `q` / `source` / `txn_type` / `sort` / `category` (same as GET /transactions/ledger).
    """
    d_from = _parse_ledger_date_param("date_from", date_from)
    d_to = _parse_ledger_date_param("date_to", date_to)
    q_s = _parse_ledger_q_param(q)
    src_s = _parse_ledger_source_param(source)
    tt_s = _parse_ledger_txn_type_param(txn_type)
    cat_s = _parse_ledger_category_param(category)
    sort_key = _parse_ledger_sort_param(sort)
    if d_from is not None and d_to is not None and d_from > d_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    where = _ledger_where(user.id, d_from, d_to, q_s, src_s, tt_s, cat_s)
    rows = await prisma.ledgertransaction.find_many(
        where=where,
        order=_ledger_order_by(sort_key),
        take=limit,
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["id", "date", "description", "amount_signed", "type", "source", "category", "confidence", "occurred_at_iso"]
    )
    for r in rows:
        amt = float(r.amount) if r.amount is not None else 0.0
        ttype = (r.txn_type or "debit").lower()
        signed = -abs(amt) if ttype == "debit" else abs(amt)
        conf = r.confidence_score
        conf_s = ""
        if conf is not None:
            conf_s = str(float(conf) if isinstance(conf, Decimal) else float(conf))
        occurred = r.occurred_at
        date_str = occurred.strftime("%Y-%m-%d") if occurred else ""
        iso = occurred.isoformat() if occurred else ""
        w.writerow(
            [
                r.id,
                date_str,
                (r.description or "").replace("\r\n", " ").replace("\n", " ")[:2000],
                f"{signed:.2f}",
                "credit" if ttype == "credit" else "debit",
                r.source or "",
                r.category or "",
                conf_s,
                iso,
            ]
        )
    body = "\ufeff" + buf.getvalue()
    suffix = ""
    if d_from or d_to:
        suffix = f"_{d_from or 'start'}_{d_to or 'end'}"
    if q_s:
        safe_q = "".join(c if c.isalnum() else "_" for c in q_s[:40])
        suffix = f"{suffix}_q{safe_q}" if suffix else f"_q{safe_q}"
    if src_s:
        safe_s = "".join(c if c.isalnum() else "_" for c in src_s[:24])
        suffix = f"{suffix}_src{safe_s}"
    if tt_s:
        suffix = f"{suffix}_{tt_s}"
    if sort_key != "date_desc":
        suffix = f"{suffix}_{sort_key}"
    if cat_s:
        safe_c = "".join(c if c.isalnum() else "_" for c in cat_s[:24])
        suffix = f"{suffix}_cat{safe_c}"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="ledger_export_{user.id}{suffix}.csv"',
        },
    )


@router.get("/ledger/summary")
async def get_ledger_summary(
    user: User = Depends(get_current_user),
    date_from: str | None = Query(None, description="Inclusive start date (YYYY-MM-DD, UTC day bounds)."),
    date_to: str | None = Query(None, description="Inclusive end date (YYYY-MM-DD, UTC day bounds)."),
    q: str | None = Query(None, description="Case-insensitive substring match on description (max 200 chars)."),
    source: str | None = Query(None, description="Exact ledger source (max 32 chars)."),
    txn_type: str | None = Query(None, description="credit or debit – filter before aggregating."),
    category: str | None = Query(None, description="Exact ledger category (max 32 chars, case-insensitive)."),
):
    """
    Aggregates persisted ledger rows: count, sum of credits, sum of debits, net (credit − debit magnitudes).
    Same `date_from` / `date_to` / `q` / `source` / `txn_type` / `category` semantics as GET /transactions/ledger.
    Uses one SQL round-trip (`transactions` table / `type` column per Prisma map).
    """
    d_from = _parse_ledger_date_param("date_from", date_from)
    d_to = _parse_ledger_date_param("date_to", date_to)
    q_s = _parse_ledger_q_param(q)
    src_s = _parse_ledger_source_param(source)
    tt_s = _parse_ledger_txn_type_param(txn_type)
    cat_s = _parse_ledger_category_param(category)
    if d_from is not None and d_to is not None and d_from > d_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    ts_from = datetime.combine(d_from, time.min, tzinfo=timezone.utc) if d_from else None
    ts_to = datetime.combine(d_to, time(23, 59, 59, 999999), tzinfo=timezone.utc) if d_to else None
    rows = await prisma.query_raw(
        """
        SELECT
          COUNT(*)::bigint AS n,
          COALESCE(
            SUM(CASE WHEN LOWER(TRIM("type")) = 'credit' THEN amount::numeric ELSE 0 END),
            0
          ) AS total_credit,
          COALESCE(
            SUM(CASE WHEN LOWER(TRIM("type")) = 'debit' THEN amount::numeric ELSE 0 END),
            0
          ) AS total_debit
        FROM transactions
        WHERE user_id = $1::int
          AND ($2::timestamptz IS NULL OR "timestamp" >= $2)
          AND ($3::timestamptz IS NULL OR "timestamp" <= $3)
          AND ($4::text IS NULL OR strpos(lower(coalesce(description, '')), lower($4::text)) > 0)
          AND ($5::text IS NULL OR lower(source) = lower($5::text))
          AND ($6::text IS NULL OR LOWER(TRIM("type")) = LOWER($6::text))
          AND ($7::text IS NULL OR lower(trim(coalesce(category, ''))) = lower(trim($7::text)))
        """,
        user.id,
        ts_from,
        ts_to,
        q_s,
        src_s,
        tt_s,
        cat_s,
    )
    row = rows[0] if rows else None
    n = int(row["n"]) if row and row.get("n") is not None else 0
    tc = float(row["total_credit"]) if row and row.get("total_credit") is not None else 0.0
    td = float(row["total_debit"]) if row and row.get("total_debit") is not None else 0.0
    return {
        "status": "ok",
        "count": n,
        "total_credit": round(tc, 2),
        "total_debit": round(td, 2),
        "net": round(tc - td, 2),
        "date_from": d_from.isoformat() if d_from else None,
        "date_to": d_to.isoformat() if d_to else None,
        "q": q_s,
        "source": src_s,
        "txn_type": tt_s,
        "category": cat_s,
    }


@router.get("/ledger")
async def get_persisted_ledger(
    user: User = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    date_from: str | None = Query(None, description="Inclusive start date (YYYY-MM-DD, UTC day bounds)."),
    date_to: str | None = Query(None, description="Inclusive end date (YYYY-MM-DD, UTC day bounds)."),
    q: str | None = Query(None, description="Case-insensitive substring match on description (max 200 chars)."),
    source: str | None = Query(None, description="Exact ledger source (max 32 chars)."),
    txn_type: str | None = Query(None, description="credit or debit – filter by ledger row type."),
    sort: str | None = Query(None, description="date_desc | date_asc | amount_desc | amount_asc (default date_desc)."),
    category: str | None = Query(None, description="Exact ledger category (max 32 chars, case-insensitive)."),
):
    """
    PostgreSQL `LedgerTransaction` rows (Razorpay webhooks, Account Aggregator, SMS→Prisma paths, etc.).
    Default order: newest by `occurred_at`. Empty list if none ingested yet.
    Optional `date_from` / `date_to` / `q` / `source` / `txn_type` / `sort` / `category`.
    """
    d_from = _parse_ledger_date_param("date_from", date_from)
    d_to = _parse_ledger_date_param("date_to", date_to)
    q_s = _parse_ledger_q_param(q)
    src_s = _parse_ledger_source_param(source)
    tt_s = _parse_ledger_txn_type_param(txn_type)
    cat_s = _parse_ledger_category_param(category)
    sort_key = _parse_ledger_sort_param(sort)
    if d_from is not None and d_to is not None and d_from > d_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    where = _ledger_where(user.id, d_from, d_to, q_s, src_s, tt_s, cat_s)
    total = await prisma.ledgertransaction.count(where=where)
    rows = await prisma.ledgertransaction.find_many(
        where=where,
        order=_ledger_order_by(sort_key),
        take=limit,
        skip=offset,
    )
    out: list[dict] = []
    for r in rows:
        amt = float(r.amount) if r.amount is not None else 0.0
        ttype = (r.txn_type or "debit").lower()
        if ttype == "debit":
            signed = -abs(amt)
        else:
            signed = abs(amt)
        conf = r.confidence_score
        conf_f = float(conf) if isinstance(conf, Decimal) else (float(conf) if conf is not None else None)
        occurred = r.occurred_at
        date_str = occurred.strftime("%Y-%m-%d") if occurred else ""
        out.append(
            {
                "id": r.id,
                "date": date_str,
                "description": (r.description or "")[:2000],
                "amount": signed,
                "type": "credit" if ttype == "credit" else "debit",
                "source": r.source or "unknown",
                "category": r.category or "",
                "confidence": conf_f,
            }
        )
    return {
        "status": "ok",
        "total": total,
        "limit": limit,
        "offset": offset,
        "date_from": d_from.isoformat() if d_from else None,
        "date_to": d_to.isoformat() if d_to else None,
        "q": q_s,
        "source": src_s,
        "txn_type": tt_s,
        "sort": sort_key,
        "category": cat_s,
        "transactions": out,
    }


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
            detail="No transactions parsed – include an amount (₹500 / Rs 500) and credit/debit cues.",
        )
    n = ingestion_service.append_parsed_transactions(parsed, source="sms")
    refresh_snapshot()
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
    """Legacy: `{"text": "..."}` – same parser as POST /transactions/sms."""
    text = str(payload.get("text") or payload.get("message") or "")
    parsed = parse_sms_batch(text)
    if not parsed:
        raise HTTPException(status_code=422, detail="No transactions parsed from SMS payload")
    n = ingestion_service.append_parsed_transactions(parsed, source="sms")
    refresh_snapshot()
    return {"status": "ingested", "rows_appended": n}
