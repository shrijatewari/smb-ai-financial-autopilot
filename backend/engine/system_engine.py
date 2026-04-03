"""
Background control loop: ingest (session ledger) → reconstruct → simulate → decide → global state.

Runs in a daemon thread; each tick calls the real financial_pipeline (500 Monte Carlo paths).
"""

from __future__ import annotations

import os
import threading
import time

import traceback

from services.financial_pipeline import run_full_pipeline
from state.global_state import update_from_error, update_from_pipeline

INTERVAL_SEC = float(os.environ.get("SYSTEM_ENGINE_INTERVAL_SEC", "5"))
INITIAL_BALANCE = float(os.environ.get("SYSTEM_ENGINE_INITIAL_BALANCE", "10000"))
HORIZON_DAYS = int(os.environ.get("SYSTEM_ENGINE_HORIZON_DAYS", "30"))
MONTE_CARLO_PATHS = int(os.environ.get("SYSTEM_ENGINE_MONTE_CARLO_PATHS", "500"))

_stop = threading.Event()
_thread: threading.Thread | None = None


def _run_tick(tick: int) -> None:
    # random_state=None → fresh stochastic draw each tick (live risk moves)
    out = run_full_pipeline(
        initial_balance=INITIAL_BALANCE,
        horizon_days=HORIZON_DAYS,
        monte_carlo_paths=MONTE_CARLO_PATHS,
        random_state=None,
    )
    update_from_pipeline(out, tick)


def _loop() -> None:
    tick = 0
    while not _stop.is_set():
        try:
            _run_tick(tick)
            tick += 1
        except Exception as e:
            update_from_error(f"{e}\n{traceback.format_exc()}", tick)
            tick += 1
        if _stop.wait(timeout=INTERVAL_SEC):
            break


def start() -> None:
    """Start daemon worker (idempotent)."""
    global _thread
    if os.environ.get("SYSTEM_ENGINE_DISABLED", "").lower() in ("1", "true", "yes"):
        return
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="system_engine", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()


def refresh_snapshot() -> None:
    """
    Run one control-plane tick immediately (e.g. after Razorpay webhook posts to the ledger).
    Safe to call from async request handlers; runs synchronously in the caller thread.
    """
    if os.environ.get("SYSTEM_ENGINE_DISABLED", "").lower() in ("1", "true", "yes"):
        return
    tick = int(time.time()) % 1_000_000_000
    try:
        _run_tick(tick)
    except Exception as e:
        update_from_error(f"{e}\n{traceback.format_exc()}", tick)
