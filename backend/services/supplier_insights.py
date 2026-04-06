"""Payables-side insight – debit concentration by category (supplier / COGS proxies)."""

from __future__ import annotations

from collections import defaultdict

from db.prisma_client import prisma

_SUPPLIER_HINTS = ("supplier", "vendor", "purchase", "stock", "material", "inventory", "expense")


async def supplier_payables_summary(user_id: int, limit: int = 12) -> dict[str, object]:
    txs = await prisma.ledgertransaction.find_many(
        where={"user_id": user_id, "txn_type": "debit"},
    )
    by_cat: dict[str, float] = defaultdict(float)
    supplier_like = 0.0
    total_debit = 0.0
    for t in txs:
        amt = float(t.amount)
        total_debit += amt
        cat = (t.category or "uncategorized").strip() or "uncategorized"
        by_cat[cat] += amt
        low = cat.lower()
        if any(h in low for h in _SUPPLIER_HINTS):
            supplier_like += amt

    ranked = sorted(by_cat.items(), key=lambda x: -x[1])[:limit]
    suggestions: list[str] = []
    if total_debit > 0 and supplier_like / total_debit > 0.35:
        suggestions.append(
            "A large share of outflows looks supplier or COGS-like – negotiate staggered terms on the top categories."
        )
    if ranked:
        top_name, top_amt = ranked[0]
        suggestions.append(f"Largest debit category in the ledger: {top_name} (~₹{top_amt:,.0f} cumulative).")

    return {
        "total_debit_inr": round(total_debit, 2),
        "supplier_like_share": round(supplier_like / total_debit, 4) if total_debit > 0 else 0.0,
        "top_categories": [{"category": k, "amount_inr": round(v, 2)} for k, v in ranked],
        "suggestions": suggestions[:5],
    }
