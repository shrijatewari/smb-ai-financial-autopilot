"""Scheduled refresh of FI data for ACTIVE AA consents."""

from __future__ import annotations

import logging
import os

from prisma.fields import Json

from db.prisma_client import prisma
from integrations.account_aggregator import fetch_fi_data, parse_aa_transactions
from services.aa_ingest import ingest_aa_transactions_for_user

logger = logging.getLogger(__name__)


async def refresh_active_aa_consents() -> dict[str, int]:
    if os.getenv("AA_REFRESH_ENABLED", "true").strip().lower() not in ("1", "true", "yes"):
        return {"consents_refreshed": 0, "rows_ingested": 0, "skipped": 1}

    rows = await prisma.aaconsent.find_many(where={"status": "ACTIVE"})
    updated = 0
    ingested = 0
    for c in rows:
        try:
            fi = fetch_fi_data(c.consent_id)
            if isinstance(fi, dict) and fi.get("error"):
                logger.warning("AA FI fetch error consent=%s: %s", c.consent_id, fi.get("error"))
                continue
            parsed = parse_aa_transactions(fi if isinstance(fi, dict) else {})
            n = await ingest_aa_transactions_for_user(c.user_id, parsed)
            ingested += n
            await prisma.aaconsent.update(
                where={"id": c.id},
                data={"linked_accounts": Json(fi if isinstance(fi, dict) else {})},
            )
            updated += 1
        except Exception as e:
            logger.exception("AA refresh failed consent=%s: %s", c.consent_id, e)
    return {"consents_refreshed": updated, "rows_ingested": ingested}
