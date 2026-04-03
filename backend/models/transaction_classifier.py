"""
Transaction classification: RandomForest on engineered features when scikit-learn
is installed; otherwise rule-based only (API still starts without sklearn).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

try:
    from sklearn.ensemble import RandomForestClassifier

    _SKLEARN_AVAILABLE = True
except ImportError:
    RandomForestClassifier = None  # type: ignore[misc, assignment]
    _SKLEARN_AVAILABLE = False

LABELS = ("sale", "supplier", "personal")
CONFIDENCE_THRESHOLD = 0.6

_rf_model: object | None = None


def _build_feature_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
    """Compute amount, is_credit, rolling frequency, relative_size_vs_mean."""
    d = df.copy()
    if "type_normalized" not in d.columns:
        d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()

    d = d.sort_values("date").reset_index(drop=True)
    d["is_credit"] = d["type_normalized"].isin(("credit", "cr", "c")).astype(int)

    amt_abs = d["amount"].abs().astype(float)
    mean_amt = float(amt_abs.mean()) if len(amt_abs) else 1.0
    mean_amt = max(mean_amt, 1e-6)
    d["relative_size_vs_mean"] = amt_abs / mean_amt

    dates = pd.to_datetime(d["date"])
    counts = []
    for i in range(len(d)):
        t0 = dates.iloc[i]
        mask = (dates >= t0 - pd.Timedelta(days=7)) & (dates <= t0)
        counts.append(int(mask.sum()))
    d["rolling_count_7d"] = counts

    X = d[["amount", "is_credit", "rolling_count_7d", "relative_size_vs_mean"]].values.astype(float)
    return d, X


def _synthetic_training_data(random_state: int = 42, n_samples: int = 500) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(random_state)
    amounts = rng.lognormal(mean=5.0, sigma=1.2, size=n_samples)
    is_credit = rng.integers(0, 2, size=n_samples)
    rolling = rng.integers(1, 25, size=n_samples)
    rel = amounts / max(float(np.mean(amounts)), 1e-6)

    y = np.full(n_samples, 2, dtype=int)

    for i in range(n_samples):
        ic = is_credit[i]
        a = amounts[i]
        if ic == 1 and a < np.percentile(amounts[is_credit == 1], 55) if (is_credit == 1).any() else a < 400:
            y[i] = 0
        elif ic == 0 and a > np.percentile(amounts[is_credit == 0], 65) if (is_credit == 0).any() else a > 800:
            y[i] = 1
        else:
            y[i] = 2

    X = np.column_stack([amounts, is_credit, rolling, rel]).astype(float)
    return X, y


def _get_or_train_rf():
    global _rf_model
    if not _SKLEARN_AVAILABLE:
        raise RuntimeError("sklearn not available")
    if _rf_model is None:
        X_syn, y_syn = _synthetic_training_data()
        _rf_model = RandomForestClassifier(
            n_estimators=80,
            max_depth=8,
            random_state=42,
            class_weight="balanced",
        )
        _rf_model.fit(X_syn, y_syn)
    return _rf_model


def _rule_based_categories(df: pd.DataFrame) -> list[str]:
    """Percentile rules (used as ML fallback and when sklearn is absent)."""
    d = df.copy()
    if "type_normalized" not in d.columns:
        d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()

    credits = d[d["type_normalized"].isin(("credit", "cr", "c"))]
    debits = d[d["type_normalized"].isin(("debit", "dr", "d"))]

    small_credit_cutoff = 450.0
    large_debit_cutoff = 850.0
    if len(credits) >= 2:
        small_credit_cutoff = float(np.percentile(credits["amount"].abs(), 60))
    if len(debits) >= 2:
        large_debit_cutoff = float(np.percentile(debits["amount"].abs(), 65))

    categories = []
    for _, row in d.iterrows():
        t = row["type_normalized"]
        amt = float(abs(row["amount"]))
        if t in ("credit", "cr", "c"):
            categories.append("sale" if amt <= small_credit_cutoff else "personal")
        elif t in ("debit", "dr", "d"):
            categories.append("supplier" if amt >= large_debit_cutoff else "personal")
        else:
            categories.append("personal")
    return categories


def classify_transaction(df: pd.DataFrame) -> pd.DataFrame:
    """Add `category` column: ML + rules when sklearn exists; else rules only."""
    if df.empty:
        out = df.copy()
        out["category"] = []
        return out

    if not _SKLEARN_AVAILABLE:
        d = df.copy()
        if "type_normalized" not in d.columns:
            d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()
        d = d.sort_values("date").reset_index(drop=True)
        d["category"] = _rule_based_categories(d)
        return d

    d, X = _build_feature_frame(df)
    clf = _get_or_train_rf()
    probas = clf.predict_proba(X)
    max_conf = np.max(probas, axis=1)

    pred_cols = np.argmax(probas, axis=1)
    pred_class_ids = clf.classes_[pred_cols]
    ml_labels = [LABELS[int(cid)] for cid in pred_class_ids]

    rules = _rule_based_categories(d)
    final = [
        ml_labels[i] if max_conf[i] >= CONFIDENCE_THRESHOLD else rules[i]
        for i in range(len(d))
    ]

    out = d.copy()
    out["category"] = final
    return out
