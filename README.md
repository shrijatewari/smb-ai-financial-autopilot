# SMB AI Financial Autopilot

> **Read this first — [full project explanation below](#project-overview).**  
> This is a **financial operating system for SMBs**: it builds an **AI-style business twin** from messy real inputs (UPI/bank SMS, CSVs, OCR documents, khata/inventory), runs **cash & risk simulation**, surfaces a **live control plane** (dashboard), and can **close the loop** with Razorpay links and Meta WhatsApp—backed by **PostgreSQL + Prisma** (not “just a login table”).

An **AI-assisted financial operating system** for small and medium businesses: cash and risk signals, collections workflow, onboarding-driven dashboards, document intelligence (OCR), inventory / khata flows, and optional integrations (Paytm mock, Razorpay links, Meta WhatsApp Cloud API).

This repository contains:

| Part | Stack | Purpose |
|------|--------|---------|
| **`backend/`** | FastAPI, PostgreSQL, Prisma (Python) | REST API, auth, business profile, ingestion, simulation engine, execution adapters |
| **`financial-control-ui/`** | React (Vite), Tailwind | Dashboard, onboarding gate, transactions, inventory, assistant, etc. |

---

## Project overview

**What this is and why it exists** — detailed product story for judges, investors, and contributors.

### The problem

Small and medium businesses in India (and similar markets) rarely run a **single source of financial truth**. Cash moves through UPI, bank SMS, Paytm, paper **khata**, WhatsApp reminders, and ad-hoc Excel—yet owners still need answers to: *How much cash do I really have? How fast am I running out? Who owes me what? What should I do today?* Traditional accounting tools expect clean books; real SMB life is **messy, event-driven, and partially observed**.

### The idea: an “AI business twin” + control plane

**SMB AI Financial Autopilot** is a **financial operating system** that sits **above** raw transactions. It is designed to:

1. **Learn your business context** — not just login credentials. A structured **business profile** (retail vs service vs hybrid, turnover band, inventory posture, credit behavior, GST posture, planned data sources) is **required onboarding** and is stored in the database. That profile drives **module selection** and **dashboard emphasis**—so the product is not a generic dashboard; it adapts to *your* business vector.

2. **Ingest reality from multiple channels** — CSV uploads, **SMS / UPI text** parsing into a working ledger, a **Paytm-style connection** (mock in demo), **document intelligence** (PDF/images → OCR → business signals), and **inventory / khata** flows that tie stock movements to cash effects where configured.

3. **Reconstruct, simulate, and surface risk** — The backend runs pipelines that combine **reconstruction** (what we can infer from messy inputs), **stochastic cash simulation**, and **risk / receivable** views. The **live control plane** exposes a continuously updated snapshot—cash, horizon risk, forecast paths, **collection queue**, and recommended **actions**—via `GET /system/state` for the authenticated user.

4. **Close the loop with execution (optional live hooks)** — The same API can generate **Razorpay payment links** when keys are set, send **WhatsApp payment reminders** via the **Meta WhatsApp Cloud API** when `WHATSAPP_*` env vars are set (otherwise simulated), and expose **simulated call** scripts for collections—so “insight → action” is not only visual.

5. **Persist identity and learn over time (foundation)** — PostgreSQL + Prisma store **users**, **business profiles**, onboarding payloads, inventory, khata uploads, and schema for **transactions**, **predictions**, **actions**, **executions**, **customers**, **documents**, and **RL** transitions—so the system can represent **business state + financial reality + decision history**, not just auth.

### What you see in the product

- **Web app (`financial-control-ui`)** — Sign up / sign in, **mandatory business profile onboarding**, then a **dynamic dashboard** (KPIs, signals, data connection blocks, collections, etc.) with navigation to transactions, cash flow, inventory, risk, GST, documents, assistant, and profile.
- **API (`backend`)** — FastAPI with OpenAPI docs; JWT auth; onboarding and system state; ingestion and execution routes as described in `backend/README.md`.

### Honest scope note

This codebase mixes **production-shaped** pieces (real Postgres, Prisma, JWT, optional Razorpay / Meta WhatsApp, OCR paths) with **demo/simulation** pieces (e.g. Paytm mock, simulated calls, parts of the engine still backed by in-memory snapshots for speed). The READMEs describe **how to run and extend** the system; treat live money-moving features as **your responsibility** to wire, test, and comply with regulations (payments, messaging, data privacy).

---

## Architecture (high level)

```mermaid
flowchart LR
  subgraph ui [Web UI]
    FC[financial-control-ui]
  end
  subgraph api [Backend API]
    FA[FastAPI]
    PE[Prisma / PostgreSQL]
    SE[System engine snapshot]
  end
  FC -->|JWT + /api proxy| FA
  FA --> PE
  FA --> SE
```

- **PostgreSQL** stores users, normalized **business profiles**, onboarding JSON, inventory, khata uploads, and optional fintech tables (`transactions`, `predictions`, `actions`, etc.—see `backend/prisma/schema.prisma`).
- **In-memory** layers (`state_store`, global snapshot) still power the live **control plane** (cash, risk, forecast, collection queue) updated by the background system engine.
- The **frontend** polls `GET /system/state` (authenticated) for KPIs and module mix.

---

## Prerequisites

- **Python** 3.11+ (3.13 used in development)
- **Node.js** 18+ and **npm** (for the UI)
- **PostgreSQL** 16+ (local Docker recommended—see below)
- **Prisma CLI** is installed **inside** `backend/.venv`—do not rely on a global `prisma` on `PATH` unless you add `.venv/bin` first (required for `prisma-client-py` during `generate`).

---

## Quick start (local development)

### 1. Clone and database

```bash
git clone https://github.com/shrijatewari/smb-ai-financial-autopilot.git
cd smb-ai-financial-autopilot/backend
```

Start Postgres (from `backend/`):

```bash
docker compose up -d
```

Default connection (matches `docker-compose.yml`):

```text
postgresql://smb:smb@localhost:5432/smb_ai
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — at minimum set DATABASE_URL if yours differs; add JWT_SECRET_KEY for production

export PATH="$(pwd)/.venv/bin:$PATH"
./scripts/sync-prisma-db.sh       # or: prisma db push + prisma generate (see backend README)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

From **repository root**, you can instead use:

```bash
chmod +x scripts/start_backend.sh
./scripts/start_backend.sh
```

(That script runs `prisma generate` and `uvicorn app:app`—ensure DB is up and `.env` exists first.)

- **API docs:** http://127.0.0.1:8000/docs  
- **Health:** `GET /health`  
- **Live snapshot (dashboard):** `GET /system/state` (requires `Authorization: Bearer <token>`)

### 3. Frontend

```bash
cd financial-control-ui
npm install
cp .env.example .env.local        # optional; dev uses Vite proxy to /api
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The dev server proxies `/api` to the backend (see `financial-control-ui/vite.config.js`).

**Auth flow:** sign up → complete **business profile onboarding** (required before the dashboard) → use the app.

---

## Environment variables (summary)

| Location | Purpose |
|----------|---------|
| `backend/.env` | `DATABASE_URL`, JWT, Razorpay, Meta WhatsApp, OCR paths, engine tuning |
| `financial-control-ui/.env` | `VITE_API_URL` in production (omit in dev to use `/api` proxy) |

Copy from each folder’s **`.env.example`** and fill secrets. **Never commit `.env`** or `ocr_key.json`.

Details: **`backend/.env.example`** (comments) and **`financial-control-ui/.env.example`**.

---

## Prisma & database

- Schema: `backend/prisma/schema.prisma`
- **Always** put `backend/.venv/bin` on `PATH` when running `prisma generate` / `db push`, or use:

  ```bash
  cd backend && ./scripts/sync-prisma-db.sh
  ```

- Baseline migration lives under `backend/prisma/migrations/`; `prisma migrate status` should show up to date after sync.

---

## WhatsApp (Meta Cloud API)

Optional live sends: set **`WHATSAPP_PHONE_NUMBER_ID`** and **`WHATSAPP_ACCESS_TOKEN`** in `backend/.env`.  
`POST /execute/whatsapp` then calls Meta Graph API; otherwise the response is simulated.  
See `backend/services/whatsapp_service.py` and comments in `backend/.env.example`.

---

## Repository layout

```text
smb-ai-financial-autopilot/
├── README.md                 # This file
├── scripts/
│   └── start_backend.sh      # Root helper to start API
├── backend/                  # FastAPI + Prisma + engine
│   ├── main.py
│   ├── prisma/
│   ├── services/
│   ├── api/routes/
│   └── README.md             # Backend-focused documentation
└── financial-control-ui/     # Vite React app
    └── README.md             # Frontend-focused documentation
```

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `prisma-client-py: command not found` | `export PATH="$(pwd)/.venv/bin:$PATH"` before `prisma generate`, or run `./scripts/sync-prisma-db.sh` |
| DB connection refused | `docker compose up -d` in `backend/`, check `DATABASE_URL` |
| CORS / API errors from UI | Ensure backend is on :8000; in dev, UI uses proxy—don’t set a wrong `VITE_API_URL` |
| Onboarding loop | Complete `POST /onboarding`; `GET /auth/me` must return `onboarding_completed: true` |

---

## License

Add a `LICENSE` file if you open-source this project; default is **all rights reserved** until you choose one.

---

## Author

Maintained by **[@shrijatewari](https://github.com/shrijatewari)** — repo: **`smb-ai-financial-autopilot`**.
