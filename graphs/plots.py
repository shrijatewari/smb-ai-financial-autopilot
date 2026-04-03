"""Matplotlib charts for demo / exports."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def _fig_path(out_dir: Path, name: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / name


def plot_cash_flow_volatility(
    days: np.ndarray | pd.Index,
    cash_values: np.ndarray,
    out_path: Path | None = None,
) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="white")
    ax.set_facecolor("white")
    ax.plot(days, cash_values, color="#1a365d", linewidth=2, marker="o", markersize=5)
    below = cash_values < 0
    if np.any(below):
        ax.scatter(
            np.asarray(days)[below],
            np.asarray(cash_values)[below],
            color="#c53030",
            s=55,
            zorder=5,
            label="Below zero",
        )
    ax.axhline(0, color="#a0aec0", linestyle="--", linewidth=1)
    ax.set_xlabel("Day")
    ax.set_ylabel("Cash (INR)")
    ax.set_title("Cash Flow Volatility")
    ax.grid(True, alpha=0.25)
    if np.any(below):
        ax.legend(loc="upper right", frameon=False)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="white")
    return fig


def plot_prediction_uncertainty(
    x: np.ndarray,
    mean: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
    out_path: Path | None = None,
) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="#fafafa")
    ax.set_facecolor("#fafafa")
    ax.fill_between(x, lower, upper, color="#bee3f8", alpha=0.85, label="±1 std")
    ax.plot(x, mean, color="#2c5282", linewidth=2.2, label="Mean prediction")
    ax.set_xlabel("Day ahead")
    ax.set_ylabel("Projected cash (INR)")
    ax.set_title("Prediction vs Uncertainty")
    ax.legend(loc="upper left", frameon=False)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="#fafafa")
    return fig


def plot_monte_carlo_histogram(
    end_cash: np.ndarray,
    out_path: Path | None = None,
) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="white")
    ax.set_facecolor("white")
    counts, bins, patches = ax.hist(end_cash, bins=35, edgecolor="white", color="#4299e1", alpha=0.85)
    for p, left, right in zip(patches, bins[:-1], bins[1:]):
        if right < 0 or left < 0:
            p.set_facecolor("#e53e3e")
    ax.set_xlabel("Simulated end cash (INR)")
    ax.set_ylabel("Frequency")
    ax.set_title("Distribution of Cash Outcomes")
    ax.axvline(0, color="#2d3748", linestyle="--", linewidth=1)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="white")
    return fig


def plot_observed_vs_reconstructed_revenue(
    out_path: Path | None = None,
    dpi: int = 300,
    random_state: int = 42,
) -> plt.Figure:
    """Slide 3: jagged observed vs smooth reconstructed revenue (demo / Bayesian story)."""
    rng = np.random.default_rng(random_state)
    days = np.arange(1, 11)
    t = (days - 1) / 9.0
    reconstructed = 4200 + 520 * t + 90 * np.sin(t * np.pi * 2.2)
    noise = rng.normal(0, 260, size=10)
    dips = np.zeros(10)
    dips[[2, 5, 8]] = [-520, -980, -410]
    observed = reconstructed - 180 - 120 * t + noise + dips

    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="white")
    ax.set_facecolor("white")
    ax.plot(
        days,
        observed,
        color="#2b6cb0",
        linewidth=2,
        marker="o",
        markersize=5,
        label="Observed Revenue",
    )
    ax.plot(
        days,
        reconstructed,
        color="#276749",
        linewidth=2.4,
        label="Reconstructed Revenue",
    )
    ax.set_xlabel("Days")
    ax.set_ylabel("Revenue (INR)")
    ax.set_title("Observed vs Reconstructed Revenue")
    ax.grid(True, alpha=0.28, linestyle="-")
    ax.legend(loc="lower right", frameon=True, fancybox=False, edgecolor="#e2e8f0")
    ax.text(
        0.5,
        0.03,
        "Reconstructed data improves decision accuracy",
        transform=ax.transAxes,
        ha="center",
        fontsize=9,
        style="italic",
        color="#4a5568",
    )
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    return fig


def plot_cash_outcomes_distribution_slide(
    out_path: Path | None = None,
    dpi: int = 300,
    random_state: int = 42,
    n_samples: int = 1000,
    mean: float = 5000.0,
    std: float = 3000.0,
) -> plt.Figure:
    """Slide 4: N(mean, std) cash outcomes; red = loss side of zero (risk story)."""
    rng = np.random.default_rng(random_state)
    values = rng.normal(mean, std, size=n_samples)

    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="white")
    ax.set_facecolor("white")
    n, bins, patches = ax.hist(
        values, bins=42, edgecolor="white", linewidth=0.6, alpha=0.92
    )
    for p, left, right in zip(patches, bins[:-1], bins[1:]):
        mid = 0.5 * (left + right)
        p.set_facecolor("#3182ce" if mid >= 0 else "#e53e3e")

    ax.axvline(0, color="#1a202c", linestyle="--", linewidth=1.2)
    ax.text(
        0.02,
        0.97,
        "Negative Cash = Financial Risk",
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=10,
        color="#2d3748",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor="#cbd5e0"),
    )
    ax.set_xlabel("Cash value (INR)")
    ax.set_ylabel("Frequency")
    ax.set_title("Distribution of Cash Outcomes")
    ax.text(
        0.5,
        0.03,
        "Probability of negative cash = risk metric",
        transform=ax.transAxes,
        ha="center",
        fontsize=9,
        style="italic",
        color="#4a5568",
    )
    ax.grid(True, axis="y", alpha=0.25)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    return fig


def plot_before_after(
    x1: np.ndarray,
    y1: np.ndarray,
    x2: np.ndarray,
    y2: np.ndarray,
    out_path: Path | None = None,
) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor="white")
    ax.set_facecolor("white")
    ax.plot(x1, y1, color="#c05621", linewidth=2, label="Before")
    ax.plot(x2, y2, color="#276749", linewidth=2, label="After")
    ax.axhline(0, color="#a0aec0", linestyle="--", linewidth=1)
    ax.set_xlabel("Day")
    ax.set_ylabel("Cash (INR)")
    ax.set_title("Impact of Financial Control System")
    ax.legend(loc="best", frameon=False)
    ax.grid(True, alpha=0.25)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="white")
    return fig


def save_all_demo_plots(
    balance: pd.Series,
    horizon: int,
    mc_end: np.ndarray,
    forecast_x: np.ndarray,
    forecast_mean: np.ndarray,
    forecast_lower: np.ndarray,
    forecast_upper: np.ndarray,
    before_x: np.ndarray,
    before_y: np.ndarray,
    after_x: np.ndarray,
    after_y: np.ndarray,
    out_dir: str | Path = "graphs/output",
) -> dict[str, Path]:
    out = Path(out_dir)
    paths = {
        "volatility": _fig_path(out, "cash_flow_volatility.png"),
        "uncertainty": _fig_path(out, "prediction_uncertainty.png"),
        "histogram": _fig_path(out, "monte_carlo_histogram.png"),
        "before_after": _fig_path(out, "before_after_stability.png"),
        "observed_vs_reconstructed": _fig_path(out, "observed_vs_reconstructed_revenue.png"),
        "cash_distribution_risk": _fig_path(out, "cash_outcomes_distribution_risk.png"),
    }
    days_idx = np.arange(1, len(balance) + 1)
    plot_cash_flow_volatility(days_idx, balance.values.astype(float), paths["volatility"])
    plt.close("all")
    plot_prediction_uncertainty(
        forecast_x, forecast_mean, forecast_lower, forecast_upper, paths["uncertainty"]
    )
    plt.close("all")
    plot_monte_carlo_histogram(mc_end, paths["histogram"])
    plt.close("all")
    plot_before_after(before_x, before_y, after_x, after_y, paths["before_after"])
    plt.close("all")
    plot_observed_vs_reconstructed_revenue(paths["observed_vs_reconstructed"], dpi=300)
    plt.close("all")
    plot_cash_outcomes_distribution_slide(paths["cash_distribution_risk"], dpi=300)
    plt.close("all")
    return paths
