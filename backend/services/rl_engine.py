"""
Tabular Q-learning for treasury action ordering (ε-greedy).

Not for cash prediction – only optimizes *which recommended action to surface first*
given discretized state (cash band, risk, receivable exposure, credit stress).

Persisted to disk so the policy improves across restarts.
"""

from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Any

# Actions the decision engine can emit (RL may reorder; do_nothing is synthetic if list empty).
ACTIONS: tuple[str, ...] = (
    "collect_payment",
    "reduce_expense",
    "offer_credit_line",
    "delay_payable",
    "do_nothing",
)

_ALPHA = float(os.environ.get("RL_LEARNING_RATE", "0.35"))
_GAMMA = float(os.environ.get("RL_DISCOUNT", "0.9"))
_EPSILON = float(os.environ.get("RL_EPSILON", "0.12"))
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_QPATH = _DATA_DIR / "rl_qtable.json"

# In-memory Q-table: state_key -> action -> value
_Q: dict[str, dict[str, float]] = {}

# Last transition for feedback endpoints (single global demo bus; multi-user can key by user_id later)
_last_transition: dict[str, Any] = {
    "state_key": None,
    "action": None,
    "next_state_key": None,
}

# Module personalization: user_id -> module_name -> weight
_module_weights: dict[int, dict[str, float]] = {}


def _load() -> None:
    global _Q, _module_weights
    if not _QPATH.is_file():
        return
    _module_weights = {}
    try:
        raw = json.loads(_QPATH.read_text(encoding="utf-8"))
        q = raw.get("Q") or {}
        if isinstance(q, dict):
            _Q = {k: {a: float(v) for a, v in (vv or {}).items()} for k, vv in q.items()}
        mw = raw.get("module_weights") or {}
        if isinstance(mw, dict):
            for uid, w in mw.items():
                try:
                    _module_weights[int(uid)] = {str(k): float(v) for k, v in (w or {}).items()}
                except (TypeError, ValueError):
                    continue
    except Exception:
        _Q = {}


def _save() -> None:
    global _module_weights
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        mw_out = {str(k): v for k, v in _module_weights.items()}
        _QPATH.write_text(
            json.dumps({"Q": _Q, "version": 1, "module_weights": mw_out}, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass


_load()


def discretize_state(
    current_cash: float,
    risk_prob: float,
    receivable_exp: float,
    default_prob: float,
    worst_case_cash: float,
) -> str:
    """Coarse buckets for tabular Q (interpretable in demos)."""
    c = max(0.0, float(current_cash))
    cash_bin = min(4, int(c / 5000.0))  # 0–4+
    risk_bin = min(4, int(max(0.0, min(1.0, risk_prob)) * 5))
    rec = max(0.0, float(receivable_exp))
    rec_bin = min(4, int(rec / 25_000.0)) if rec > 0 else 0
    def_bin = min(4, int(max(0.0, min(1.0, default_prob)) * 5))
    stress = 1 if float(worst_case_cash) < 0 else 0
    return f"c{cash_bin}_r{risk_bin}_rec{rec_bin}_d{def_bin}_w{stress}"


def _q_get(state: str, action: str) -> float:
    return float(_Q.setdefault(state, {}).get(action, 0.0))


def _q_set(state: str, action: str, value: float) -> None:
    if state not in _Q:
        _Q[state] = {}
    _Q[state][action] = float(value)


def _max_q_next(state: str) -> float:
    if state not in _Q or not _Q[state]:
        return 0.0
    return max(float(v) for v in _Q[state].values())


def update_q(state: str, action: str, reward: float, next_state: str) -> None:
    """Q-learning update."""
    if not state or not action or action not in ACTIONS:
        return
    q_sa = _q_get(state, action)
    max_next = _max_q_next(next_state)
    next_term = _GAMMA * max_next
    td_target = float(reward) + next_term
    td_error = td_target - q_sa
    _q_set(state, action, q_sa + _ALPHA * td_error)
    _save()


def select_action_epsilon_greedy(state: str, allowed_actions: list[str]) -> str:
    """Choose one action from allowed set; explore with ε."""
    if not allowed_actions:
        return "do_nothing"
    if random.random() < _EPSILON:
        return random.choice(allowed_actions)
    best = None
    best_q = -1e18
    for a in allowed_actions:
        qv = _q_get(state, a)
        if qv > best_q:
            best_q = qv
            best = a
    # tie-break: prefer collect_payment when risk state implies liquidity
    if best is None:
        return allowed_actions[0]
    return best


def rank_actions(
    candidates: list[dict[str, Any]],
    *,
    current_cash: float,
    risk_prob: float,
    receivable_exp: float,
    default_prob: float,
    worst_case_cash: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Reorder rule-generated actions so the RL policy picks first.
    """
    global _last_transition

    state_key = discretize_state(
        current_cash, risk_prob, receivable_exp, default_prob, worst_case_cash
    )

    if not candidates:
        dummy = {
            "action": "do_nothing",
            "priority": "low",
            "reason": "No rule triggers; RL state idle.",
            "confidence": 0.5,
            "metadata": {"rl": True},
        }
        meta = {
            "state_key": state_key,
            "selected_action": "do_nothing",
            "mode": "empty",
            "epsilon": _EPSILON,
        }
        _last_transition = {
            "state_key": state_key,
            "action": "do_nothing",
            "next_state_key": state_key,
        }
        return [dummy], meta

    names = [str(a.get("action", "")) for a in candidates if a.get("action")]
    allowed = [n for n in names if n in ACTIONS]
    if not allowed:
        allowed = names[:]

    chosen = select_action_epsilon_greedy(state_key, allowed)

    # Move chosen to front
    rest = [a for a in candidates if str(a.get("action")) != chosen]
    primary = next((a for a in candidates if str(a.get("action")) == chosen), candidates[0])
    if primary not in rest:
        rest = [a for a in candidates if a is not primary]
    ordered = [primary] + rest

    q_snap = {a: round(_q_get(state_key, a), 4) for a in allowed}

    _last_transition = {
        "state_key": state_key,
        "action": chosen,
        "next_state_key": state_key,
    }

    meta = {
        "state_key": state_key,
        "selected_action": chosen,
        "epsilon": _EPSILON,
        "q_values": q_snap,
        "mode": "ranked",
    }
    return ordered, meta


def apply_reward_from_feedback(
    reward: float,
    next_state_key: str | None = None,
) -> dict[str, Any]:
    """Apply one-step TD update using last transition (from feed or execute)."""
    st = _last_transition.get("state_key")
    act = _last_transition.get("action")
    if not st or not act:
        return {"ok": False, "detail": "no_prior_transition"}
    nxt = next_state_key or str(_last_transition.get("next_state_key") or st)
    update_q(st, act, float(reward), nxt)
    return {"ok": True, "state_key": st, "action": act, "reward": reward}


def seed_warm_q_if_enabled() -> None:
    """Optional bootstrap so demo starts with sensible bias (env RL_SEED_BOOTSTRAP=1)."""
    if _Q:
        return
    if os.environ.get("RL_SEED_BOOTSTRAP", "1").lower() not in ("1", "true", "yes"):
        return
    # Gentle prior: collect slightly better in high-risk buckets
    for r in range(3, 5):
        for c in range(0, 4):
            sk = f"c{c}_r{r}_rec0_d0_w1"
            _q_set(sk, "collect_payment", max(_q_get(sk, "collect_payment"), 0.35))
    _save()


seed_warm_q_if_enabled()


def bump_module_weight(user_id: int, module_name: str, delta: float) -> dict[str, float]:
    """Personalize module ordering from UI (lightweight)."""
    if user_id not in _module_weights:
        _module_weights[user_id] = {}
    w = _module_weights[user_id]
    w[module_name] = float(w.get(module_name, 0.0) + delta)
    _save()
    return dict(w)


def get_module_weights(user_id: int) -> dict[str, float]:
    return dict(_module_weights.get(user_id, {}))


def get_last_transition() -> dict[str, Any]:
    return dict(_last_transition)


def get_epsilon() -> float:
    return _EPSILON
