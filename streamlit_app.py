"""Streamlit UI: upload CSV, show risk metrics and charts."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".mplconfig"))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from graphs.plots import (
    plot_before_after,
    plot_cash_flow_volatility,
    plot_cash_outcomes_distribution_slide,
    plot_monte_carlo_histogram,
    plot_observed_vs_reconstructed_revenue,
    plot_prediction_uncertainty,
)
from models.cashflow import daily_cash_balance, load_transactions, projected_net_series
from models.credit import CreditRiskModel, transaction_features
from models.risk import forecast_mean_std, monte_carlo_shortage


def _fig_to_buffer(fig):
    import io

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    buf.seek(0)
    return buf


st.set_page_config(page_title="SMB Financial Intelligence", layout="wide")
st.title("SMB Financial Intelligence (demo)")
st.caption("Upload transaction CSV with columns: date, amount, category, payment_delay_days")

default_path = ROOT / "data" / "sample_transactions.csv"
uploaded = st.file_uploader("Transactions CSV", type=["csv"])
initial = st.sidebar.number_input("Initial cash", value=12000.0, step=500.0)
horizon = st.sidebar.slider("Forecast horizon (days)", 5, 30, 10)
mc_runs = st.sidebar.select_slider("Monte Carlo runs", options=[250, 500, 1000, 2000], value=1000)

if uploaded is not None:
    df = pd.read_csv(uploaded)
else:
    df = pd.read_csv(default_path)
    st.info("Using bundled sample data. Upload a file to analyze your own.")

df["date"] = pd.to_datetime(df["date"])
if "payment_delay_days" not in df.columns:
    df["payment_delay_days"] = 0
df["payment_delay_days"] = df["payment_delay_days"].fillna(0).astype(int)

balance = daily_cash_balance(df, initial_cash=initial)
mc = monte_carlo_shortage(balance, horizon_days=horizon, n_runs=mc_runs)
mean, std = forecast_mean_std(balance)
start = float(balance.iloc[-1]) if len(balance) else 0.0
fx = np.arange(1, horizon + 1)
fmean = start + mean * fx
flower = start + (mean - std) * fx
fupper = start + (mean + std) * fx

stable_daily = max(float(np.mean(balance.diff().dropna())), 0.0) + std * 0.15
after_path = projected_net_series(balance, horizon, mean_daily_net=stable_daily)
before_x = np.arange(1, len(balance) + 1)
before_y = balance.values.astype(float)
after_x = np.arange(len(balance) + 1, len(balance) + 1 + horizon)
after_y = after_path.values.astype(float)

feats = transaction_features(df, balance)
credit = CreditRiskModel()
p_default = credit.default_probability(feats)
band = credit.risk_band(p_default)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Ending cash (INR)", f"₹{balance.iloc[-1]:,.0f}" if len(balance) else "–")
c2.metric(
    "Shortage risk (any day)",
    f"{100 * mc['probability_shortage_any_day']:.1f}%",
)
c3.metric("Negative cash at horizon", f"{100 * mc['probability_negative_end']:.1f}%")
c4.metric("Credit risk (default prob.)", f"{100 * p_default:.1f}%", help=f"Band: {band}")

st.divider()
col_a, col_b = st.columns(2)
with col_a:
    f1 = plot_cash_flow_volatility(np.arange(1, len(balance) + 1), balance.values.astype(float))
    st.image(_fig_to_buffer(f1), use_container_width=True)

with col_b:
    f2 = plot_prediction_uncertainty(fx, fmean, flower, fupper)
    st.image(_fig_to_buffer(f2), use_container_width=True)

col_c, col_d = st.columns(2)
with col_c:
    f3 = plot_monte_carlo_histogram(mc["end_cash_simulations"])
    st.image(_fig_to_buffer(f3), use_container_width=True)

with col_d:
    f4 = plot_before_after(before_x, before_y, after_x, after_y)
    st.image(_fig_to_buffer(f4), use_container_width=True)

for f in (f1, f2, f3, f4):
    plt.close(f)

st.divider()
st.subheader("Slide-ready charts (reconstruction & risk)")
col_e, col_f = st.columns(2)
with col_e:
    f5 = plot_observed_vs_reconstructed_revenue()
    st.image(_fig_to_buffer(f5), use_container_width=True)
    plt.close(f5)
with col_f:
    f6 = plot_cash_outcomes_distribution_slide()
    st.image(_fig_to_buffer(f6), use_container_width=True)
    plt.close(f6)
