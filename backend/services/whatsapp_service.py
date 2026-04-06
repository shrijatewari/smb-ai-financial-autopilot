"""WhatsApp payment reminders – Meta Cloud API when configured, else simulated send."""

from __future__ import annotations

import mimetypes
import os
from io import BytesIO
from pathlib import Path
from typing import Any

import requests


def default_payment_link(amount: float) -> str:
    """Demo deep link shape; replace with Razorpay short link from `/execute/payment-link` when wired."""
    return f"https://paytm.com/pay?amount={int(round(amount))}"


def generate_payment_message(
    customer: str,
    amount: float,
    tone: str = "formal",
    payment_link: str | None = None,
    shop_name: str | None = None,
) -> str:
    """
    Reminder with Razorpay (or demo) short link on its own line at the end.
    Friendly: Hindi khaata-style layout; formal: English layout – link always last.
    """
    link = payment_link or default_payment_link(amount)
    tone_norm = (tone or "formal").lower().strip()
    first = customer.split("(")[0].split(",")[0].strip() or customer
    shop = (shop_name or "Dukaan").strip() or "Dukaan"
    total_inr = int(round(float(amount)))
    amt_comma = f"{amount:,.0f}"

    if tone_norm == "friendly":
        return (
            f"Namaste {first} ji,\n\n"
            f"{shop} se aapka {total_inr} rupaye baaki hai.\n\n"
            f"Aapki khareedari ki details:\n"
            f"• Khaate ka kul (jab bill judega, yahan line items dikhenge)\n\n"
            f"Kul rakam: ₹{amt_comma}\n"
            f"Tarikh: –\n"
            f"Bill number: –\n\n"
            f"Kripya jald se jald bhej dijiye. Shukriya 🙏\n\n"
            f"{link}"
        )

    return (
        f"Namaste {first},\n\n"
        f"Your outstanding at {shop} is ₹{amt_comma}.\n\n"
        f"Purchase details:\n"
        f"• Total per ledger (itemized lines when a bill is linked)\n\n"
        f"Total: ₹{amt_comma}\n"
        f"Date: –\n"
        f"Bill number: –\n\n"
        f"Please pay at your earliest. Thank you.\n\n"
        f"{link}"
    )


def _digits_only(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _meta_recipient_id(phone: str) -> str:
    """Meta expects E.164 without + (digits only). Optional default country code for 10-digit local numbers."""
    d = _digits_only(phone)
    if len(d) == 10:
        cc = (os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE") or "").strip().lstrip("+")
        if cc:
            return cc + d
    return d


def meta_whatsapp_configured() -> bool:
    return bool(
        (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
        and (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    )


def send_whatsapp_message(phone: str, message: str) -> dict[str, Any]:
    """
    Outbound WhatsApp text.

    When `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are set, calls Meta Graph API:
    POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages

    Otherwise returns a simulated success (same shape, `mock: true`).
    """
    to = _meta_recipient_id(phone)
    if len(to) < 8:
        return {
            "status": "error",
            "mock": True,
            "phone": phone,
            "detail": "Invalid phone for WhatsApp (need full international digits or 10-digit + WHATSAPP_DEFAULT_COUNTRY_CODE).",
        }

    if not meta_whatsapp_configured():
        return {
            "status": "sent",
            "mock": True,
            "phone": to,
            "message": message,
        }

    phone_number_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    version = (os.getenv("WHATSAPP_GRAPH_API_VERSION") or "v21.0").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = message.strip()
    if len(body) > 4096:
        body = body[:4093] + "..."

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=45)
        data = r.json() if r.content else {}
    except requests.RequestException as e:
        return {
            "status": "error",
            "mock": False,
            "phone": to,
            "detail": str(e),
        }

    if r.status_code >= 400:
        err = data.get("error") if isinstance(data, dict) else {}
        msg = err.get("message") if isinstance(err, dict) else None
        return {
            "status": "error",
            "mock": False,
            "phone": to,
            "detail": msg or r.text or f"HTTP {r.status_code}",
            "meta": data,
        }

    return {
        "status": "sent",
        "mock": False,
        "phone": to,
        "message": message,
        "meta_message_id": (data.get("messages") or [{}])[0].get("id") if isinstance(data, dict) else None,
        "meta": data,
    }


def build_khaata_bill_proof_message(
    shop_name: str,
    customer_name: str,
    amount: float,
    bill_parts: dict[str, Any],
    payment_link: str,
) -> str:
    """
    Hindi/English mix reminder with itemized bill lines (proof).
    `bill_parts` from bill_to_message_parts: parsed_lines, total_amount, bill_number, created_at, source.
    """
    first = (customer_name or "ji").split("(")[0].split(",")[0].strip() or "ji"
    lines = bill_parts.get("parsed_lines") or []
    bullet_lines: list[str] = []
    for row in lines:
        if not isinstance(row, dict):
            continue
        if row.get("matched") is False and not row.get("name"):
            continue
        nm = str(row.get("name") or "").strip()
        qty = row.get("qty")
        try:
            qf = float(qty) if qty is not None else 0.0
        except (TypeError, ValueError):
            qf = 0.0
        try:
            up = float(row.get("unit_price") or 0)
        except (TypeError, ValueError):
            up = 0.0
        line_amt = qf * up
        if nm:
            bullet_lines.append(f"• {nm} x {qf:g} – ₹{line_amt:,.0f}")

    items_block = "\n".join(bullet_lines) if bullet_lines else "• (details attached / see total below)"
    total = float(bill_parts.get("total_amount") or amount)
    bnum = str(bill_parts.get("bill_number") or "–")
    bdate = str(bill_parts.get("created_at") or "")[:10] or "–"
    shop = shop_name or "Hamari dukaan"

    return (
        f"Namaste {first} ji,\n\n"
        f"{shop} se aapka {total:,.0f} rupaye baaki hai.\n\n"
        f"Aapki khareedari ki details:\n"
        f"{items_block}\n\n"
        f"Kul rakam: ₹{total:,.0f}\n"
        f"Tarikh: {bdate}\n"
        f"Bill number: {bnum}\n\n"
        f"Kripya jald se jald bhej dijiye. Shukriya 🙏\n\n"
        f"{payment_link}"
    )


def _meta_upload_media(file_path: Path) -> dict[str, Any]:
    """Upload file to Meta; returns {ok, media_id?, detail?}."""
    if not meta_whatsapp_configured() or not file_path.is_file():
        return {"ok": False, "detail": "not_configured_or_missing_file"}
    phone_number_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    version = (os.getenv("WHATSAPP_GRAPH_API_VERSION") or "v21.0").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/media"
    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "application/octet-stream"
    # Meta expects type field: document | image | audio | video
    if mime.startswith("image/"):
        wtype = "image"
    elif mime == "application/pdf" or file_path.suffix.lower() == ".pdf":
        wtype = "document"
    else:
        wtype = "document"

    try:
        raw = file_path.read_bytes()
    except OSError as e:
        return {"ok": False, "detail": str(e)}
    try:
        files = {"file": (file_path.name, BytesIO(raw), mime)}
        data = {
            "messaging_product": "whatsapp",
            "type": wtype,
        }
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {token}"},
            data=data,
            files=files,
            timeout=120,
        )
    except requests.RequestException as e:
        return {"ok": False, "detail": str(e)}

    try:
        j = r.json() if r.content else {}
    except Exception:
        j = {}
    if r.status_code >= 400:
        err = j.get("error") if isinstance(j, dict) else {}
        msg = err.get("message") if isinstance(err, dict) else None
        return {"ok": False, "detail": msg or r.text or f"HTTP {r.status_code}"}
    mid = j.get("id") if isinstance(j, dict) else None
    if not mid:
        return {"ok": False, "detail": "no media id"}
    return {"ok": True, "media_id": str(mid), "whatsapp_type": wtype}


def send_whatsapp_media_message(phone: str, media_id: str, whatsapp_type: str, caption: str = "") -> dict[str, Any]:
    """Send a document or image message by media id (after upload)."""
    to = _meta_recipient_id(phone)
    if len(to) < 8:
        return {
            "status": "error",
            "mock": True,
            "detail": "Invalid phone",
        }
    if not meta_whatsapp_configured():
        return {"status": "sent", "mock": True, "phone": to, "message": caption, "media": media_id}

    phone_number_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    version = (os.getenv("WHATSAPP_GRAPH_API_VERSION") or "v21.0").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    cap = (caption or "")[:1024]
    if whatsapp_type == "image":
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "image",
            "image": {"id": media_id, "caption": cap},
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": {"id": media_id, "caption": cap, "filename": "bill.pdf"},
        }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=60)
        data = r.json() if r.content else {}
    except requests.RequestException as e:
        return {"status": "error", "mock": False, "detail": str(e)}
    if r.status_code >= 400:
        err = data.get("error") if isinstance(data, dict) else {}
        msg = err.get("message") if isinstance(err, dict) else None
        return {"status": "error", "mock": False, "detail": msg or r.text}
    return {"status": "sent", "mock": False, "phone": to, "meta": data}


def try_send_bill_attachment(phone: str, file_path: str | None, caption: str) -> dict[str, Any]:
    """
    Upload local file and send as WhatsApp media; never raises.
    Returns {sent: bool, detail?: str} – caller should still send text if False.
    """
    if not file_path:
        return {"sent": False, "detail": "no file"}
    p = Path(file_path)
    if not p.is_file():
        return {"sent": False, "detail": "file missing"}
    up = _meta_upload_media(p)
    if not up.get("ok"):
        return {"sent": False, "detail": str(up.get("detail") or "upload failed")}
    wt = str(up.get("whatsapp_type") or "document")
    out = send_whatsapp_media_message(phone, str(up["media_id"]), wt, caption=caption)
    if out.get("status") != "sent":
        return {"sent": False, "detail": str(out.get("detail") or "send failed")}
    return {"sent": True}
