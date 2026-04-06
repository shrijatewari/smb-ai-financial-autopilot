"""Display helpers – all ledger amounts are Indian Rupees (INR)."""


def inr(amount: float | int, decimals: int = 0) -> str:
    """Format a number as ₹ with thousands separators (Western grouping)."""
    a = float(amount)
    if decimals > 0:
        return f"₹{a:,.{decimals}f}"
    return f"₹{a:,.0f}"
