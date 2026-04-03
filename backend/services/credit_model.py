"""Credit default probability via logistic regression on engineered features."""

from __future__ import annotations

import numpy as np
import pandas as pd

try:
    from sklearn.linear_model import LogisticRegression

    _SKLEARN = True
except ImportError:
    LogisticRegression = None  # type: ignore[misc, assignment]
    _SKLEARN = False

from utils.feature_engineering import build_credit_feature_vector


def _synthetic_training(rng: np.random.Generator, n: int = 400) -> tuple[np.ndarray, np.ndarray]:
    X = rng.normal(size=(n, 3))
    # default more likely when delay high, volatility high, repayment low
    logit = -0.4 + 1.1 * X[:, 0] + 1.0 * X[:, 2] - 0.9 * X[:, 1]
    p = 1.0 / (1.0 + np.exp(-logit))
    y = (rng.random(n) < p).astype(int)
    return X, y


_model: object | None = None


def default_probability(df: pd.DataFrame) -> dict[str, float]:
    """
    P(default) = 1 / (1 + exp(-(β0 + β·x))) on delay frequency, repayment consistency, volatility.
    Returns risk_score in [0, 1] aligned with estimated default probability.
    """
    X_live = build_credit_feature_vector(df)
    global _model

    if not _SKLEARN:
        # Sigmoid on hand-crafted score
        x = X_live.ravel()
        z = -0.5 + 0.9 * x[0] + 0.7 * x[2] - 0.8 * x[1]
        p = float(1.0 / (1.0 + np.exp(-z)))
        return {"default_probability": p, "risk_score": p, "model": "heuristic_sigmoid"}

    if _model is None:
        rng = np.random.default_rng(42)
        X_syn, y_syn = _synthetic_training(rng)
        _model = LogisticRegression(max_iter=200, class_weight="balanced", random_state=42)
        _model.fit(X_syn, y_syn)

    proba = _model.predict_proba(X_live)[0, 1]
    p = float(np.clip(proba, 1e-6, 1.0 - 1e-6))
    return {"default_probability": p, "risk_score": p, "model": "logistic_regression_v1"}
