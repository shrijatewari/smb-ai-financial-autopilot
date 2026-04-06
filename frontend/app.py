"""
Streamlit dashboard – Business Financial Dashboard (FastAPI backend).

Run: cd frontend && streamlit run app.py
Backend: http://127.0.0.1:8000
"""

from __future__ import annotations

import html
import io

import plotly.graph_objects as go
import requests
import streamlit as st

from utils.currency import inr

# -----------------------------------------------------------------------------
# API helpers
# -----------------------------------------------------------------------------


def check_backend_health(backend_base: str) -> tuple[bool, str]:
    try:
        r = requests.get(f"{backend_base}/health", timeout=5)
        if r.status_code == 200:
            return True, "Connected"
        return False, f"HTTP {r.status_code}"
    except requests.exceptions.RequestException as e:
        return False, str(e)


def fetch_dashboard(
    backend_base: str,
    initial_balance: float,
    horizon_days: int,
    user_id: str,
) -> dict | None:
    params = {
        "initial_balance": initial_balance,
        "horizon_days": horizon_days,
        "user_id": user_id,
    }
    try:
        r = requests.get(f"{backend_base}/v1/dashboard", params=params, timeout=60)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        st.session_state["_last_error"] = str(e)
        return None


def post_upload(backend_base: str, file_name: str, file_bytes: bytes) -> tuple[bool, str]:
    try:
        files = {"file": (file_name, io.BytesIO(file_bytes), "text/csv")}
        r = requests.post(f"{backend_base}/upload", files=files, timeout=60)
        r.raise_for_status()
        return True, r.json().get("message", "OK")
    except requests.exceptions.RequestException as e:
        return False, str(e)


def post_sms_ingest(backend_base: str, text: str) -> tuple[bool, str]:
    """
    Canonical: POST /transactions/sms with {"message": "..."} (same as React financial-control-ui).
    Legacy fallbacks for older demos.
    """
    base = backend_base.rstrip("/")
    attempts: list[tuple[str, dict]] = [
        (f"{base}/transactions/sms", {"message": text}),
        (f"{base}/intelligence/ingest/sms", {"text": text}),
        (f"{base}/ingest/sms", {"text": text}),
    ]
    last_err: str | None = None
    for url, payload in attempts:
        try:
            r = requests.post(url, json=payload, timeout=60)
            if r.status_code == 404:
                continue
            r.raise_for_status()
            body = r.json()
            if isinstance(body, dict):
                if body.get("message"):
                    return True, str(body["message"])
                ra = body.get("rows_appended")
                if ra is not None:
                    return True, f"Ingested {ra} row(s)"
                if body.get("parsed") is not None and isinstance(body["parsed"], int):
                    return True, f"Parsed {body['parsed']} row(s)"
            return True, "OK"
        except requests.exceptions.RequestException as e:
            last_err = str(e)
            continue
    return False, last_err or "SMS ingest failed"


def post_ocr_ingest(backend_base: str, file_name: str, file_bytes: bytes, content_type: str | None) -> tuple[bool, str]:
    try:
        files = {"file": (file_name, io.BytesIO(file_bytes), content_type or "application/octet-stream")}
        r = requests.post(f"{backend_base}/intelligence/ingest/ocr", files=files, timeout=120)
        r.raise_for_status()
        body = r.json()
        return True, body.get("message", "OK")
    except requests.exceptions.RequestException as e:
        return False, str(e)


def get_onboarding(backend_base: str) -> dict:
    """GET /onboarding – current stored payload."""
    try:
        r = requests.get(f"{backend_base}/onboarding", timeout=15)
        if r.status_code == 200:
            return r.json() if r.content else {}
    except requests.exceptions.RequestException:
        pass
    return {}


def post_onboarding(backend_base: str, payload: dict) -> tuple[bool, str, dict | None]:
    """POST /onboarding – persist intelligence-layer onboarding."""
    try:
        r = requests.post(f"{backend_base}/onboarding", json=payload, timeout=30)
        r.raise_for_status()
        return True, "Onboarding saved", r.json()
    except requests.exceptions.RequestException as e:
        return False, str(e), None


def risk_color(p: float) -> str:
    if p > 0.3:
        return "#DC2626"
    if p >= 0.1:
        return "#CA8A04"
    return "#16A34A"


def alert_class(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ("critical", "severe", "shortfall", "default", "urgent")):
        return "alert-critical"
    return "alert-warning"


# -----------------------------------------------------------------------------
# Page
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Business Financial Dashboard",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      html, body, [class*="css"]  {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
      .stApp {
        background-color: #F8FAFC !important;
      }
      .main .block-container {
        padding-top: 1.25rem !important;
        padding-bottom: 2rem !important;
        padding-left: 2rem !important;
        padding-right: 2rem !important;
        max-width: 1280px !important;
      }
      .dash-header {
        margin-bottom: 0.35rem;
      }
      .dash-header h1 {
        font-size: 1.65rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: #0F172A;
        margin: 0;
      }
      .dash-subtitle {
        font-size: 0.9rem;
        color: #64748B;
        margin: 0 0 1.5rem 0;
        font-weight: 400;
      }
      #dash-metrics-row + div div[data-testid="column"] > div {
        background: #FFFFFF !important;
        border-radius: 12px !important;
        padding: 16px !important;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06) !important;
        border: 1px solid #E2E8F0 !important;
      }
      .metric-risk-label {
        font-size: 0.8rem;
        color: #64748B;
        font-weight: 500;
        margin-bottom: 0.35rem;
      }
      .metric-risk-value {
        font-size: 1.75rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.2;
      }
      .section-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748B;
        margin: 2rem 0 0.75rem 0;
      }
      .fin-chart-box {
        background: #FFFFFF;
        border-radius: 12px;
        padding: 8px 8px 4px 8px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
        border: 1px solid #E2E8F0;
        margin-bottom: 0.5rem;
      }
      .alert-critical {
        background: #FEF2F2;
        border-left: 4px solid #DC2626;
        color: #991B1B;
        padding: 12px 14px;
        border-radius: 8px;
        font-size: 0.9rem;
        margin-bottom: 10px;
      }
      .alert-warning {
        background: #FFFBEB;
        border-left: 4px solid #EA580C;
        color: #9A3412;
        padding: 12px 14px;
        border-radius: 8px;
        font-size: 0.9rem;
        margin-bottom: 10px;
      }
      .alert-empty {
        color: #64748B;
        font-size: 0.9rem;
        padding: 8px 0;
      }
      .action-card {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 12px;
        padding: 16px 18px;
        margin-bottom: 12px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .action-type {
        font-size: 0.8rem;
        font-weight: 600;
        color: #0F172A;
        text-transform: capitalize;
        margin-bottom: 6px;
      }
      .action-meta {
        font-size: 0.875rem;
        color: #475569;
      }
      .action-meta strong { color: #0F172A; font-weight: 500; }
      .pay-link-box {
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 10px 12px;
        margin-top: 10px;
        font-size: 0.8rem;
        word-break: break-all;
      }
      .pay-link-box a { color: #2563EB; text-decoration: none; font-weight: 500; }
      .pay-link-box a:hover { text-decoration: underline; }
      div[data-testid="stSidebar"] {
        background-color: #FFFFFF !important;
        border-right: 1px solid #E2E8F0 !important;
      }
      .intel-strip {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 1rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      }
      .intel-strip .label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 4px; }
      .intel-strip .value { font-size: 0.9rem; color: #0F172A; }
      .module-pill {
        display: inline-block;
        background: #EFF6FF;
        color: #1D4ED8;
        font-size: 0.78rem;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 999px;
        margin: 2px 6px 2px 0;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

# --- Sidebar ---
with st.sidebar:
    st.markdown("**Connection**")
    backend_base = st.text_input(
        "API base URL",
        value="http://127.0.0.1:8000",
        placeholder="http://127.0.0.1:8000",
    ).rstrip("/")
    initial_balance = st.number_input("Opening balance (INR)", value=10000.0, step=500.0)
    horizon_days = st.slider("Forecast horizon (days)", 5, 90, 30)
    user_id = st.text_input("User ID", value="demo_user")

    ok_h, msg_h = check_backend_health(backend_base)
    if ok_h:
        st.caption(msg_h)
    else:
        st.caption(f"Offline: {msg_h[:120]}")

    st.divider()
    with st.expander("Onboarding", expanded=False):
        existing = get_onboarding(backend_base) if ok_h else {}
        with st.form("onboarding_form", clear_on_submit=False):
            ob_bt = st.text_input(
                "Business type",
                value=existing.get("business_type") or "Retail / general",
                key="onb_business_type",
            )
            ob_rev = st.selectbox(
                "Revenue model",
                options=["product", "service", "hybrid"],
                index=["product", "service", "hybrid"].index(existing["revenue_model"])
                if existing.get("revenue_model") in ("product", "service", "hybrid")
                else 2,
                key="onb_revenue_model",
            )
            ob_turn = st.text_input(
                "Monthly turnover range",
                value=existing.get("monthly_turnover_range") or "5-25L",
                placeholder="e.g. 5-25L",
                key="onb_turnover",
            )
            ob_emp = st.number_input("Employees", min_value=0, value=int(existing.get("num_employees") or 5), step=1, key="onb_employees")
            ob_inv = st.selectbox(
                "Inventory type",
                options=["none", "low", "high", "high_value"],
                index=["none", "low", "high", "high_value"].index(existing["inventory_type"])
                if existing.get("inventory_type") in ("none", "low", "high", "high_value")
                else 1,
                key="onb_inventory",
            )
            ob_cred = st.selectbox(
                "Credit usage",
                options=["none", "informal", "formal"],
                index=["none", "informal", "formal"].index(existing["credit_usage"])
                if existing.get("credit_usage") in ("none", "informal", "formal")
                else 1,
                key="onb_credit",
            )
            pm = existing.get("payment_mix") or {}
            c_cash = st.slider("Payment mix: cash", 0.0, 1.0, float(pm.get("cash", 0.4)), 0.05, key="onb_cash")
            c_dig = max(0.0, min(1.0, 1.0 - c_cash))
            st.caption(f"Digital (auto): {c_dig:.0%}")
            ob_gst = st.checkbox("GST registered", value=bool(existing.get("gst_registered")), key="onb_gst")
            ob_bank = st.checkbox("Has bank data", value=bool(existing.get("has_bank_data")), key="onb_bank")
            ob_invdoc = st.checkbox("Has invoices", value=bool(existing.get("has_invoices")), key="onb_invoices")
            submitted_onb = st.form_submit_button("Save onboarding", use_container_width=True, type="primary")

        if submitted_onb:
            payload = {
                "business_type": ob_bt,
                "revenue_model": ob_rev,
                "monthly_turnover_range": ob_turn,
                "num_employees": int(ob_emp),
                "inventory_type": ob_inv,
                "credit_usage": ob_cred,
                "payment_mix": {"cash": float(c_cash), "digital": float(c_dig)},
                "gst_registered": ob_gst,
                "has_bank_data": ob_bank,
                "has_invoices": ob_invdoc,
            }
            ok_o, msg_o, _ = post_onboarding(backend_base, payload)
            if ok_o:
                st.session_state["dashboard_data"] = fetch_dashboard(
                    backend_base, initial_balance, horizon_days, user_id
                )
                st.success(msg_o)
            else:
                st.error(msg_o)

    st.divider()
    with st.expander("Import data", expanded=False):
        up = st.file_uploader("CSV", type=["csv"], key="csv_uploader")
        if st.button("Upload CSV", type="primary", disabled=up is None, use_container_width=True):
            if up is not None:
                ok, msg = post_upload(backend_base, up.name, up.getvalue())
                if ok:
                    st.session_state["dashboard_data"] = fetch_dashboard(
                        backend_base, initial_balance, horizon_days, user_id
                    )
                else:
                    st.error(msg)
        sms_text = st.text_area("SMS text", height=72, label_visibility="collapsed", placeholder="Paste bank SMS", key="sms_text")
        if st.button("Ingest SMS", disabled=not (sms_text or "").strip(), use_container_width=True):
            ok_s, msg_s = post_sms_ingest(backend_base, (sms_text or "").strip())
            if ok_s:
                st.session_state["dashboard_data"] = fetch_dashboard(
                    backend_base, initial_balance, horizon_days, user_id
                )
            else:
                st.error(msg_s)
        ocr_up = st.file_uploader("Invoice", type=["png", "jpg", "jpeg", "pdf"], key="ocr_uploader")
        if st.button("Ingest OCR", disabled=ocr_up is None, use_container_width=True):
            if ocr_up is not None:
                ct = getattr(ocr_up, "type", None) or "application/octet-stream"
                ok_o, msg_o = post_ocr_ingest(backend_base, ocr_up.name, ocr_up.getvalue(), ct)
                if ok_o:
                    st.session_state["dashboard_data"] = fetch_dashboard(
                        backend_base, initial_balance, horizon_days, user_id
                    )
                else:
                    st.error(msg_o)

    if st.button("Refresh", use_container_width=True):
        st.session_state["dashboard_data"] = fetch_dashboard(
            backend_base, initial_balance, horizon_days, user_id
        )

if "dashboard_data" not in st.session_state:
    st.session_state["dashboard_data"] = fetch_dashboard(
        backend_base, initial_balance, horizon_days, user_id
    )

data = st.session_state.get("dashboard_data")

if data is None:
    st.error("Cannot reach the API. Start the backend and check the URL in the sidebar.")
    st.caption(st.session_state.get("_last_error", ""))
    st.stop()

# --- Derived values ---
risk = float(data.get("risk_probability", 0.0))
min_cash = float(data.get("min_cash", 0.0))
max_cash = float(data.get("max_cash", 0.0))
cf = data.get("cash_flow") or []
current_balance = float(cf[-1]["balance"]) if cf else float(initial_balance)
r_col = risk_color(risk)

# --- Header ---
st.markdown(
    """
    <div class="dash-header">
      <h1>Business Financial Dashboard</h1>
    </div>
    <p class="dash-subtitle">AI-powered insights for your business</p>
    """,
    unsafe_allow_html=True,
)

# --- Business intelligence (from API: onboarding + merged ledger) ---
bp = data.get("business_profile") or {}
ss = data.get("system_state") or {}
inv_st = data.get("inventory_state") or {}
mods = data.get("active_modules") or []

col_ia, col_ib, col_ic = st.columns(3)
with col_ia:
    st.markdown('<div class="intel-strip">', unsafe_allow_html=True)
    st.markdown('<div class="label">Active modules</div>', unsafe_allow_html=True)
    if mods:
        pills = "".join(
            f'<span class="module-pill">{html.escape(str(m.get("name", "")))} {float(m.get("priority", 0)):.0%}</span>'
            for m in mods[:8]
        )
        st.markdown(f'<div class="value">{pills}</div>', unsafe_allow_html=True)
    else:
        st.markdown(
            '<div class="value" style="color:#64748B;">No modules listed. Save onboarding in the sidebar.</div>',
            unsafe_allow_html=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)
with col_ib:
    st.markdown('<div class="intel-strip">', unsafe_allow_html=True)
    st.markdown('<div class="label">Liquidity state</div>', unsafe_allow_html=True)
    liq = html.escape(str(ss.get("liquidity_state", "–")))
    st.markdown(f'<div class="value">{liq}</div>', unsafe_allow_html=True)
    if ss.get("last_balance") is not None:
        st.caption(f"Last balance: {inr(float(ss.get('last_balance', 0)), 2)}")
    st.markdown("</div>", unsafe_allow_html=True)
with col_ic:
    st.markdown('<div class="intel-strip">', unsafe_allow_html=True)
    st.markdown('<div class="label">Inventory</div>', unsafe_allow_html=True)
    ip = inv_st.get("inventory_pressure")
    if ip is not None:
        st.markdown(
            f'<div class="value">Pressure {float(ip):.0%} · {html.escape(str(inv_st.get("inventory_type", "")))}</div>',
            unsafe_allow_html=True,
        )
    else:
        st.markdown('<div class="value" style="color:#64748B;">–</div>', unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)

if bp.get("business_type") or bp.get("revenue_model"):
    st.caption(
        f"Profile: {bp.get('business_type', '–')} · {bp.get('revenue_model', '–')} · "
        f"GST {'yes' if bp.get('gst_registered') else 'no'}"
    )

# --- Key metrics ---
st.markdown('<div id="dash-metrics-row"></div>', unsafe_allow_html=True)
c1, c2, c3, c4 = st.columns(4)
with c1:
    st.markdown(
        f"""
        <div class="metric-risk-label">Risk probability</div>
        <div class="metric-risk-value" style="color:{r_col};">{risk:.1%}</div>
        """,
        unsafe_allow_html=True,
    )
with c2:
    st.metric("Current balance", inr(current_balance, 2))
with c3:
    st.metric("Min cash (worst case)", inr(min_cash, 2))
with c4:
    st.metric("Max cash (best case)", inr(max_cash, 2))

mix = data.get("source_mix") or {}
if mix and sum(mix.values()) > 0:
    parts = []
    for k in ("csv", "paytm", "sms", "ocr"):
        n = int(mix.get(k, 0) or 0)
        if n:
            parts.append(f"{k.upper()} {n}")
    st.caption("Ledger: " + " · ".join(parts) if parts else "Ledger: –")

st.markdown('<div style="height:8px"></div>', unsafe_allow_html=True)
st.divider()

# --- Cash flow ---
st.markdown('<p class="section-label">Cash flow</p>', unsafe_allow_html=True)
if cf:
    dates = [row["date"] for row in cf]
    balances = [row["balance"] for row in cf]
    fig_cf = go.Figure()
    fig_cf.add_trace(
        go.Scatter(
            x=dates,
            y=balances,
            mode="lines",
            name="Balance",
            line=dict(color="#2563EB", width=2.5, shape="spline"),
            fill="tozeroy",
            fillcolor="rgba(37, 99, 235, 0.06)",
        )
    )
    fig_cf.update_layout(
        paper_bgcolor="#FFFFFF",
        plot_bgcolor="#FFFFFF",
        height=380,
        margin=dict(l=16, r=16, t=24, b=16),
        showlegend=False,
        hovermode="x unified",
        xaxis=dict(
            title="Date",
            showgrid=False,
            zeroline=False,
            tickfont=dict(size=11, color="#64748B"),
            title_font=dict(size=12, color="#64748B"),
        ),
        yaxis=dict(
            title="Balance (INR)",
            showgrid=True,
            gridcolor="#F1F5F9",
            zeroline=False,
            tickfont=dict(size=11, color="#64748B"),
            title_font=dict(size=12, color="#64748B"),
        ),
    )
    fig_cf.update_yaxes(tickprefix="₹", separatethousands=True)
    st.markdown('<div class="fin-chart-box">', unsafe_allow_html=True)
    st.plotly_chart(fig_cf, width="stretch", config={"displayModeBar": False})
    st.markdown("</div>", unsafe_allow_html=True)
else:
    st.caption("No cash flow series.")

st.divider()

# --- Simulation ---
st.markdown('<p class="section-label">Simulation</p>', unsafe_allow_html=True)
fb = data.get("future_balances") or []
if fb:
    terminal = [path[-1] for path in fb if path]
    fig_hist = go.Figure()
    fig_hist.add_trace(
        go.Histogram(
            x=terminal,
            nbinsx=40,
            marker_color="#2563EB",
            opacity=0.88,
        )
    )
    fig_hist.add_vline(
        x=0,
        line_dash="dash",
        line_color="#94A3B8",
        line_width=1,
    )
    fig_hist.update_layout(
        title=dict(text="Future Cash Distribution", font=dict(size=15, color="#0F172A")),
        paper_bgcolor="#FFFFFF",
        plot_bgcolor="#FFFFFF",
        height=380,
        margin=dict(l=16, r=16, t=48, b=16),
        showlegend=False,
        xaxis=dict(
            title="Ending balance (INR)",
            showgrid=False,
            tickfont=dict(size=11, color="#64748B"),
            title_font=dict(size=12, color="#64748B"),
        ),
        yaxis=dict(
            title="Frequency",
            showgrid=True,
            gridcolor="#F1F5F9",
            tickfont=dict(size=11, color="#64748B"),
            title_font=dict(size=12, color="#64748B"),
        ),
    )
    fig_hist.update_xaxes(tickprefix="₹", separatethousands=True)
    st.markdown('<div class="fin-chart-box">', unsafe_allow_html=True)
    st.plotly_chart(fig_hist, width="stretch", config={"displayModeBar": False})
    st.markdown("</div>", unsafe_allow_html=True)
else:
    st.caption("No simulation paths.")

st.divider()

# --- Alerts ---
st.markdown('<p class="section-label">Alerts</p>', unsafe_allow_html=True)
alerts = data.get("alerts") or []
if alerts:
    for a in alerts:
        cls = alert_class(a)
        st.markdown(
            f'<div class="{cls}">{html.escape(a)}</div>',
            unsafe_allow_html=True,
        )
else:
    st.markdown('<p class="alert-empty">No active alerts.</p>', unsafe_allow_html=True)

st.markdown('<div style="height:8px"></div>', unsafe_allow_html=True)

# --- Actions ---
st.markdown('<p class="section-label">Recommended actions</p>', unsafe_allow_html=True)
actions = data.get("recommended_actions") or []

if "payment_clicked" not in st.session_state:
    st.session_state["payment_clicked"] = {}

for i, act in enumerate(actions):
    atype = (act.get("type") or "").replace("_", " ").strip() or "Action"
    amt = act.get("amount")
    cust = act.get("customer") or "–"
    link = act.get("link")
    detail = act.get("detail") or ""

    amt_line = ""
    if amt is not None:
        amt_line = f"<strong>Amount</strong> {html.escape(inr(amt, 2))}<br/>"

    row_l, row_r = st.columns([5, 1])
    with row_l:
        st.markdown(
            f"""
            <div class="action-card">
              <div class="action-type">{html.escape(atype.title())}</div>
              <div class="action-meta">
                {amt_line}
                <strong>Customer</strong> {html.escape(str(cust))}
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with row_r:
        if act.get("type") == "collect_payment" and link:
            if st.button("Send Payment Request", key=f"pay_btn_{i}", type="primary", use_container_width=True):
                st.session_state["payment_clicked"][i] = True

    if act.get("type") == "collect_payment" and link and st.session_state["payment_clicked"].get(i):
        safe_link = html.escape(link)
        st.markdown(
            f"""
            <div class="pay-link-box">
              <a href="{safe_link}" target="_blank" rel="noopener noreferrer">Open payment link</a>
              <div style="margin-top:6px;color:#64748B;">{safe_link}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    elif act.get("type") == "reduce_expenses" and detail:
        st.caption(detail)

if not actions:
    st.caption("No actions at this time.")

st.divider()

# --- Secondary: ledger & profile ---
with st.expander("Transaction ledger", expanded=False):
    tx_rows = data.get("transactions") or []
    if tx_rows:
        preview = []
        for t in tx_rows[-25:]:
            preview.append(
                {
                    "Date": t.get("date"),
                    "Amount": t.get("amount"),
                    "Type": t.get("type"),
                    "Category": t.get("category"),
                    "Source": t.get("source") or "csv",
                    "Balance": round(float(t.get("balance", 0)), 2),
                }
            )
        st.dataframe(preview, hide_index=True, width="stretch")
    else:
        st.caption("No rows.")

with st.expander("Business profile", expanded=False):
    p = data.get("profile") or {}
    g1, g2, g3 = st.columns(3)
    with g1:
        st.metric("Avg transaction (INR)", inr(p.get("average_transaction_size", 0), 2))
    with g2:
        st.metric("Credit / debit ratio", f"{p.get('credit_debit_ratio', 0):.2f}")
    with g3:
        st.metric("Credits / debits", f"{p.get('credit_count', 0)} / {p.get('debit_count', 0)}")
    if data.get("receivables") is not None or data.get("cash_gap") is not None:
        h1, h2, h3 = st.columns(3)
        with h1:
            st.metric("Receivables (est.)", inr(float(data.get("receivables", 0)), 2))
        with h2:
            st.metric("Cash gap (stress)", inr(float(data.get("cash_gap", 0)), 2))
        with h3:
            st.metric("Action score", f"{float(data.get('action_score', 0)):.2f}")
    if p.get("formality_score") is not None or p.get("trust_score") is not None:
        j1, j2 = st.columns(2)
        with j1:
            st.metric("Formality", f"{float(p.get('formality_score', 0)):.2f}")
        with j2:
            st.metric("Trust", f"{float(p.get('trust_score', 0)):.2f}")
    if bp.get("business_vector_labels") and bp.get("business_vector"):
        st.caption("Business vector (engine)")
        vec = bp.get("business_vector") or []
        labels = bp.get("business_vector_labels") or []
        rows = [{"feature": labels[i] if i < len(labels) else f"v{i}", "value": vec[i]} for i in range(min(len(vec), len(labels) or len(vec)))]
        if rows:
            st.dataframe(rows, hide_index=True, width="stretch")
    if ss:
        st.caption("System state (API)")
        st.json(ss)
    if inv_st:
        st.caption("Inventory state (API)")
        st.json(inv_st)
