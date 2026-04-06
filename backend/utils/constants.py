"""Application constants for the financial control system."""

from __future__ import annotations

# Risk & decision thresholds
CASH_RISK_ALERT_THRESHOLD: float = 0.25
ACTION_TRIGGER_THRESHOLD: float = 0.35
CREDIT_LINE_RISK_FLOOR: float = 0.15

# Simulation defaults
DEFAULT_MONTE_CARLO_PATHS: int = 1000
DEFAULT_FORECAST_HORIZON_DAYS: int = 30
MIN_SIMULATION_PATHS: int = 500

# Reconstruction
MIN_CONFIDENCE_FLOOR: float = 0.15
MAX_CONFIDENCE_CEILING: float = 0.97

# Lags (days) – operating assumptions when not inferred from data
DEFAULT_RECEIVABLE_LAG_DAYS: float = 7.0
DEFAULT_PAYABLE_LAG_DAYS: float = 5.0

# Classification labels
CLASS_REVENUE = "revenue"
CLASS_EXPENSE = "expense"
CLASS_LOAN = "loan"
CLASS_SUPPLIER = "supplier"
CLASS_UNKNOWN = "unknown"
