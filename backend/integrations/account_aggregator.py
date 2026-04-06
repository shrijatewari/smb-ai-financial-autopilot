"""
Setu Account Aggregator (sandbox / production) – consent + FI data.

Docs: https://docs.setu.co/data/account-aggregator – paths configurable via env.
When credentials are missing, returns mock consent + sample FI JSON for local dev.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import date, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)


def _base() -> str:
    return (os.getenv("SETU_AA_BASE_URL") or "").strip().rstrip("/")


def _configured() -> bool:
    return bool(
        _base()
        and (os.getenv("SETU_AA_CLIENT_ID") or "").strip()
        and (os.getenv("SETU_AA_CLIENT_SECRET") or "").strip()
    )


def _auth_headers() -> dict[str, str]:
    """Many Setu deployments use client id/secret as Bearer or Basic – override via SETU_AA_AUTH_HEADER."""
    custom = (os.getenv("SETU_AA_AUTH_HEADER") or "").strip()
    if custom:
        name, _, val = custom.partition(":")
        if name and val:
            return {name.strip(): val.strip()}
    token = (os.getenv("SETU_AA_ACCESS_TOKEN") or "").strip()
    if token:
        return {"Authorization": f"Bearer {token}"}
    cid = (os.getenv("SETU_AA_CLIENT_ID") or "").strip()
    csec = (os.getenv("SETU_AA_CLIENT_SECRET") or "").strip()
    if cid and csec:
        return {"Authorization": f"Bearer {csec}", "X-Client-Id": cid}
    return {}


def create_consent_request(user_id: int, mobile: str, redirect_url: str) -> dict[str, Any]:
    """
    Start AA consent – returns consent_id and redirect_url for the user to approve at their bank AA app.

    Sandbox without keys: returns mock values so the rest of the flow can be tested.
    """
    digits = "".join(c for c in mobile if c.isdigit())
    if len(digits) < 10:
        return {"error": "Invalid mobile – need at least 10 digits."}

    consent_id = f"cons_{uuid.uuid4().hex[:12]}"
    if not _configured():
        logger.info("SETU AA not configured – returning mock consent for user %s", user_id)
        mock_url = f"{redirect_url}{'&' if '?' in redirect_url else '?'}consent_id={consent_id}&mock=1"
        return {
            "consent_id": consent_id,
            "redirect_url": mock_url,
            "mock": True,
        }

    path = (os.getenv("SETU_AA_CONSENT_PATH") or "/v2/consents").strip()
    url = f"{_base()}{path}"
    payload = {
        "customer": {"id": str(user_id), "mobile": digits[-10:]},
        "redirectUrl": redirect_url,
        "consentDuration": {"unit": "MONTH", "value": 12},
    }
    try:
        r = requests.post(url, json=payload, headers={**_auth_headers(), "Content-Type": "application/json"}, timeout=60)
        data = r.json() if r.content else {}
    except requests.RequestException as e:
        logger.exception("Setu create consent failed")
        return {"error": str(e)}

    if r.status_code >= 400:
        return {"error": data.get("message") if isinstance(data, dict) else r.text, "status_code": r.status_code}

    cid = None
    redir = None
    if isinstance(data, dict):
        cid = data.get("id") or data.get("consentId") or data.get("consent_id")
        redir = data.get("url") or data.get("redirectUrl") or data.get("webview")
    if not cid or not redir:
        return {"error": "Unexpected Setu response shape", "raw": data}

    return {"consent_id": str(cid), "redirect_url": str(redir), "mock": False}


def fetch_fi_data(consent_id: str) -> dict[str, Any]:
    """
    Fetch FI (financial information) JSON for an approved consent.
    """
    if not consent_id:
        return {"error": "missing consent_id"}

    if not _configured():
        logger.info("SETU AA mock FI fetch for %s", consent_id)
        return _mock_fi_payload(consent_id)

    path_tpl = (os.getenv("SETU_AA_FI_PATH") or "/v2/consents/{consent_id}/fi").strip()
    url = f"{_base()}{path_tpl.format(consent_id=consent_id)}"
    try:
        r = requests.get(url, headers=_auth_headers(), timeout=120)
        data = r.json() if r.content else {}
    except requests.RequestException as e:
        return {"error": str(e)}

    if r.status_code >= 400:
        return {"error": data if isinstance(data, dict) else r.text, "status_code": r.status_code}
    return data if isinstance(data, dict) else {"raw": data}


def _mock_fi_payload(consent_id: str) -> dict[str, Any]:
    """Deterministic demo FI for sandbox."""
    today = date.today()
    rows = []
    for i in range(5):
        d = today - timedelta(days=i * 3)
        rows.append(
            {
                "txnId": f"mock-{consent_id}-{i}",
                "date": d.isoformat(),
                "amount": 1500.0 + i * 200,
                "type": "debit" if i % 2 == 0 else "credit",
                "narration": f"UPI / IMPS sample {i}",
                "balance": 45000.0 - i * 1000,
            }
        )
    return {
        "consentId": consent_id,
        "accounts": [
            {
                "maskedAccNumber": "XXXX1234",
                "transactions": rows,
            }
        ],
    }


def parse_aa_transactions(fi_data: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Normalize AA FI payload into rows compatible with LedgerTransaction / CSV ingest:
    date, amount (positive), type (credit|debit), description.
    """
    out: list[dict[str, Any]] = []
    accounts = fi_data.get("accounts") or fi_data.get("Accounts") or []
    for acc in accounts:
        for tx in acc.get("transactions") or acc.get("Transactions") or []:
            if not isinstance(tx, dict):
                continue
            ds = str(tx.get("date") or tx.get("txnDate") or tx.get("valueDate") or "")[:10]
            amt = tx.get("amount") or tx.get("transactionAmount") or 0
            try:
                amount = abs(float(amt))
            except (TypeError, ValueError):
                continue
            ttype = str(tx.get("type") or tx.get("transactionType") or "debit").lower()
            if "credit" in ttype or ttype == "cr":
                norm = "credit"
            else:
                norm = "debit"
            desc = str(tx.get("narration") or tx.get("description") or tx.get("txnId") or "AA")[:500]
            tid = str(tx.get("txnId") or tx.get("txnid") or tx.get("id") or "")[:128]
            out.append(
                {
                    "date": ds,
                    "amount": amount,
                    "type": norm,
                    "description": f"AA: {desc}"[:200],
                    "txn_id": tid,
                }
            )
    return out
