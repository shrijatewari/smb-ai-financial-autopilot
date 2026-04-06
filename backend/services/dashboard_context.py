"""Contextual action-screen contract (not a generic dashboard)."""

from __future__ import annotations

from typing import Any


def build_dashboard_context(snap: dict[str, Any], onboarding: dict[str, Any] | None) -> dict[str, Any]:
    """
    Drives frontend: what to emphasize (inventory vs service vs credit), risk level, literacy UI.
    Hint strings are per-locale objects (hi, en, ta, te, bn) so the UI can render pure language.
    """
    ob = onboarding or {}
    risk = float(snap.get("risk") or 0.0)
    dc = snap.get("daily_control") or {}
    days_neg = dc.get("days_to_negative")
    meta = snap.get("meta") or {}
    tick = int(meta.get("tick") or 0)

    if (days_neg is not None and days_neg <= 7) or risk > 0.35:
        risk_level = "high"
    elif (days_neg is not None and days_neg <= 14) or risk > 0.2:
        risk_level = "medium"
    else:
        risk_level = "low"

    revenue_model = str(ob.get("revenue_model") or "hybrid")
    inv = str(ob.get("inventory_type") or "low")
    credit = str(ob.get("credit_usage") or "none")

    lit = str(ob.get("literacy_preference") or "standard")
    if lit not in ("minimal", "standard"):
        lit = "standard"

    secondary = "cash"
    if credit in ("informal", "formal"):
        secondary = "credit"
    elif revenue_model == "product" and inv != "none":
        secondary = "inventory"
    elif revenue_model == "service":
        secondary = "service"

    show_inv = revenue_model == "product" and inv != "none"
    show_svc = revenue_model == "service"
    show_credit = credit in ("informal", "formal")

    inventory_hint = None
    if show_inv:
        need = 18 + (tick % 12)
        inventory_hint = {
            "headline": {
                "hi": "स्टॉक जल्दी कम हो सकता है",
                "en": "Stock may run low soon",
                "ta": "பங்கு விரைவில் குறையலாம்",
                "te": "స్టాక్ త్వరలో తగ్గవచ్చు",
                "bn": "স্টক শীঘ্রই কমতে পারে",
            },
            "sub": {
                "hi": f"कल के लिए ~{need} यूनिट मंगवाएं / जाँच करें",
                "en": f"Order / check ~{need} units for tomorrow",
                "ta": f"நாளைக்கு ~{need} யூனிட்கள் ஆர்டர் / சரிபார்க்கவும்",
                "te": f"రేపటికి ~{need} యూనిట్లు ఆర్డర్ / తనిఖీ చేయండి",
                "bn": f"আগামীকালের জন্য ~{need} ইউনিট অর্ডার / যাচাই করুন",
            },
            "cta": {
                "hi": "ऑर्डर करें",
                "en": "Place order",
                "ta": "ஆர்டர் செய்யுங்கள்",
                "te": "ఆర్డర్ చేయండి",
                "bn": "অর্ডার করুন",
            },
        }

    service_hint = None
    if show_svc:
        variant = tick % 3
        # Low / medium / high demand tone (rotates with tick)
        service_rows: list[dict[str, str]] = [
            {
                "hi": "कल मांग कम लग रही है – स्लॉट / कॉल पर जाएँ।",
                "en": "Tomorrow's demand looks low – follow up on slots / calls.",
                "ta": "நாளை தேவை குறைவாக உள்ளது – ஸ்லாட் / அழைப்புகளை பின்பற்றவும்.",
                "te": "రేపటి డిమాండ్ తక్కువగా ఉంది – స్లాట్లు / కాల్‌లను ఫాలో అప్ చేయండి.",
                "bn": "আগামীকাল চাহিদা কম মনে হচ্ছে – স্লট / কল ফলো করুন।",
            },
            {
                "hi": "कल मांग ठीक-ठाक है – स्लॉट / कॉल पर जाएँ।",
                "en": "Tomorrow's demand looks moderate – follow up on slots / calls.",
                "ta": "நாளை தேவை மிதமாக உள்ளது – ஸ்லாட் / அழைப்புகளை பின்பற்றவும்.",
                "te": "రేపటి డిమాండ్ మోడరేట్‌గా ఉంది – స్లాట్లు / కాల్‌లను ఫాలో అప్ చేయండి.",
                "bn": "আগামীকাল চাহিদা মাঝারি মনে হচ্ছে – স্লট / কল ফলো করুন।",
            },
            {
                "hi": "कल मांग ज़्यादा लग रही है – स्लॉट / कॉल पर जाएँ।",
                "en": "Tomorrow's demand looks high – follow up on slots / calls.",
                "ta": "நாளை தேவை அதிகமாக உள்ளது – ஸ்லாட் / அழைப்புகளை பின்பற்றவும்.",
                "te": "రేపటి డిమాండ్ ఎక్కువగా ఉంది – స్లాట్లు / కాల్‌లను ఫాలో అప్ చేయండి.",
                "bn": "আগামীকাল চাহিদা বেশি মনে হচ্ছে – স্লট / কল ফলো করুন।",
            },
        ]
        sub_row = service_rows[variant]
        service_hint = {
            "headline": {
                "hi": "कल की बुकिंगें",
                "en": "Tomorrow's bookings",
                "ta": "நாளைய முன்பதிவுகள்",
                "te": "రేపటి బుకింగ్‌లు",
                "bn": "আগামীকালের বুকিং",
            },
            "sub": sub_row,
        }

    return {
        "mode": "basic",
        "risk_level": risk_level,
        "primary_action": snap.get("action"),
        "secondary_module": secondary,
        "literacy_ui": lit,
        "flags": {
            "show_inventory_strip": show_inv,
            "show_service_booking_hint": show_svc,
            "show_credit_priority_list": show_credit,
            "auto_guided_voice": risk_level == "high",
        },
        "inventory_hint": inventory_hint,
        "service_hint": service_hint,
    }
