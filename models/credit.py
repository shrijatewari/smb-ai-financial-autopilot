"""Simple credit risk score from transaction-derived features (logistic regression)."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


def transaction_features(df: pd.DataFrame, balance: pd.Series) -> pd.DataFrame:
    """Build a single-row feature vector for the business."""
    nets = balance.diff().dropna() if len(balance) > 1 else pd.Series([0.0])
    neg_ratio = float((nets < 0).mean()) if len(nets) else 0.0
    volatility = float(nets.std()) if len(nets) > 1 else 0.0
    mean_net = float(nets.mean()) if len(nets) else 0.0
    min_bal = float(balance.min()) if len(balance) else 0.0
    delay_wt_outflow = 0.0
    out_neg = df[df["amount"] < 0]
    if len(out_neg):
        delay_wt_outflow = float(
            (out_neg["amount"].abs() * out_neg["payment_delay_days"]).sum()
            / out_neg["amount"].abs().sum()
        )
    rows = pd.DataFrame(
        {
            "neg_day_ratio": [neg_ratio],
            "daily_net_std": [volatility],
            "mean_daily_net": [mean_net],
            "min_balance": [min_bal],
            "avg_payment_delay_weight": [delay_wt_outflow],
        }
    )
    return rows


def _score_vector(X: pd.DataFrame) -> np.ndarray:
    return (
        -0.02 * X["min_balance"].values
        + 2.0 * X["daily_net_std"].values
        - 0.5 * X["mean_daily_net"].values
        + 1.5 * X["neg_day_ratio"].values
        + 0.3 * X["avg_payment_delay_weight"].values
    )


class CreditRiskModel:
    """Wraps scaled logistic regression; fit on synthetic panel around observed features."""

    def __init__(self) -> None:
        self._scaler = StandardScaler()
        self._clf = LogisticRegression(max_iter=500, random_state=42)
        self._fitted = False
        self._use_heuristic_only = False

    def fit_default(self, X: pd.DataFrame) -> None:
        """
        Augment single-merchant rows into a synthetic panel, label by risk score,
        then fit logistic regression (stable for hackathon demo).
        """
        rng = np.random.default_rng(42)
        cols = list(X.columns)
        base = X.iloc[0].values.astype(float)
        n_aug = 120
        noise = rng.normal(0, 1.0, size=(n_aug, len(cols)))
        scales = np.array([max(abs(base[i]), 1e-3) * 0.12 for i in range(len(cols))])
        X_aug = base + noise * scales
        X_all = pd.DataFrame(np.vstack([X.values, X_aug]), columns=cols)
        score = _score_vector(X_all)
        y = (score > np.median(score)).astype(int)
        if len(np.unique(y)) < 2:
            y = (score > np.percentile(score, 60)).astype(int)
        if len(np.unique(y)) < 2:
            self._use_heuristic_only = True
            self._fitted = True
            return
        self._scaler.fit(X_all.values)
        self._clf.fit(self._scaler.transform(X_all.values), y)
        self._fitted = True
        self._use_heuristic_only = False

    def default_probability(self, X: pd.DataFrame) -> float:
        if not self._fitted:
            self.fit_default(X)
        if self._use_heuristic_only:
            z = float(_score_vector(X.iloc[0:1]).item())
            return float(1.0 / (1.0 + np.exp(-z / 250.0)))
        z_row = self._scaler.transform(X.values)
        proba = self._clf.predict_proba(z_row)[0, 1]
        return float(proba)

    def risk_band(self, p_default: float) -> str:
        if p_default < 0.25:
            return "low"
        if p_default < 0.55:
            return "medium"
        return "high"
