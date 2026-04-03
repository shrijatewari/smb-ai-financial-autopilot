# Self-Learning Financial Control System for SMBs

**Voice-first AI that predicts cash risk, recommends what to do today, and can execute collections — built for real Indian SMB behavior (Hindi / Hinglish, messy data, action over analytics).**

*Repository: [smb-ai-financial-autopilot](https://github.com/shrijatewari/smb-ai-financial-autopilot)*

---

## Problem

Small businesses rarely fail from lack of effort — they fail because **the financial future is invisible**.

- Cash flow is **unpredictable** (UPI + cash + khata, not one clean ledger)  
- **Payments are delayed**; owners don’t know who hurts them most today  
- Records are **incomplete** — digital and cash don’t match  
- Most “SMB tools” are **dashboards**, not **decision systems**  

Owners don’t want another chart. They need:

**“What should I do today?”**

---

## Solution

A **Self-Learning Financial Control System** that:

| Capability | What it means |
|------------|----------------|
| **Reconstructs** messy inputs | SMS/UPI text, CSV, OCR, khata → working signals |
| **Simulates** uncertainty | Monte Carlo paths, cash-at-risk over a horizon |
| **Decides** | Collect, delay expense, collections priority — not only KPIs |
| **Executes** (optional live hooks) | Razorpay links, Meta WhatsApp reminders, Twilio voice |
| **Speaks your language** | Hindi, Hinglish, regional via translation + voice assistant |
| **Today-first UX** | “Aaj kya karna hai” — one risk line, one action, three buttons |

This is **not** a passive dashboard. It is an **operating layer** that sits on top of messy reality.

---

## Key features

### Financial intelligence
- Cash & horizon risk from reconstructed ledger + simulation  
- Monte Carlo cash paths (configurable paths / horizon)  
- Missing / inferred cash reconstruction from observed flows  

### Decision engine
- Prioritized actions (e.g. collect payment, reduce expense, delay payable)  
- **Before / after** outcome hints (collect vs do nothing)  
- Tabular RL hooks — action ordering can improve over feedback  

### Execution layer
- **Razorpay payment links** (`POST /execute/payment-link`) when keys are set  
- **Meta WhatsApp** outbound reminders when `WHATSAPP_*` is configured  
- **Twilio** Hindi voice calls (`POST /execute/twilio-call`) when `TWILIO_*` is set  
- Simulated call scripts when integrations are off  

### Voice assistant (India-first)
- Multilingual pipeline: detect → translate → core engine → translate back  
- gTTS / browser speech; optional OpenAI Whisper for uploaded audio  
- Assistant UI: `financial-control-ui` → `/assistant`  

### Data integration
- SMS / UPI text ingest → ledger rows  
- Document OCR (Google Vision optional; local Tesseract fallback)  
- Paytm-style mock feed  
- Inventory + **khata** sale → stock + ledger movement when you apply a sale  
- **Persisted ledger** (`LedgerTransaction` in PostgreSQL) — filtered list, aggregates, and CSV export via `GET /transactions/ledger*`, with the **Transactions** page (`/transactions`) in `financial-control-ui` staying in sync (bookmarkable query string). See **Persisted ledger API** below and `backend/README.md`.  

### Adaptive UI
- Onboarding-driven **business profile** → module mix and emphasis  
- **Today** home (`/`) — action-first; full analytics under `/dashboard`  

---

## How it works

```mermaid
flowchart TB
  subgraph inputs [Inputs]
    OB[Onboarding / Business profile]
    SMS[SMS and UPI text]
    CSV[CSV upload]
    OCR[Documents OCR]
    KH[Khata / inventory sale]
  end
  subgraph core [Core pipeline]
    ING[Ingestion and session ledger]
    REC[Reconstruction]
    SIM[Monte Carlo simulation]
    DEC[Decision engine]
    RL[RL rank optional]
  end
  subgraph plane [Live plane]
    ENG[Background system engine tick]
    SNAP[Global snapshot GET /system/state]
  end
  subgraph exec [Execution optional]
    RZ[Razorpay links]
    WA[WhatsApp Cloud API]
    TW[Twilio voice]
  end
  OB --> ING
  SMS --> ING
  CSV --> ING
  OCR --> ING
  KH --> ING
  ING --> REC --> SIM --> DEC --> RL
  RL --> ENG --> SNAP
  DEC --> RZ
  DEC --> WA
  DEC --> TW
```

The **system engine** runs on a timer (default ~5s), refreshes simulation output, and updates the snapshot the UI polls.

---

## Persisted ledger API (PostgreSQL)

Durable rows live in the `transactions` table (Prisma model `LedgerTransaction`). The UI calls the same query parameters for **list**, **summary**, and **CSV export** (summary omits `sort` and pagination; export uses a server-side row cap).

```mermaid
flowchart LR
  subgraph ui [financial-control-ui]
    TX["/transactions"]
    API["api.js\nfetchLedger* / downloadLedgerCsv"]
    TX --> API
  end
  subgraph be [FastAPI]
    L["GET /transactions/ledger"]
    S["GET /transactions/ledger/summary"]
    E["GET /transactions/ledger/export"]
  end
  PG[("PostgreSQL\ntransactions")]
  API -->|"JWT + filters"| L
  API -->|"shared filters"| S
  API -->|"shared filters + sort"| E
  L --> PG
  S --> PG
  E --> PG
```

| Query param | List | Summary | Export | Purpose |
|-------------|:----:|:-------:|:------:|---------|
| `date_from`, `date_to` | ✓ | ✓ | ✓ | UTC day bounds (`YYYY-MM-DD`) |
| `q` | ✓ | ✓ | ✓ | Case-insensitive substring on description (max 200 chars) |
| `source` | ✓ | ✓ | ✓ | Exact match, case-insensitive (max 32 chars) |
| `category` | ✓ | ✓ | ✓ | Exact match, case-insensitive (max 32 chars) |
| `txn_type` | ✓ | ✓ | ✓ | `credit` or `debit` |
| `sort` | ✓ | — | ✓ | `date_desc` (default), `date_asc`, `amount_desc`, `amount_asc` |
| `offset`, `limit` | ✓ | — | — | Pagination on list only (export is full filtered set up to server `limit`) |

Filters can be combined; the Transactions page mirrors them in the URL for sharing (`?date_from=&date_to=&q=&source=&category=&txn_type=&sort=`).

---

## Architecture

```mermaid
flowchart LR
  subgraph client [Browser]
    UI[React Vite Tailwind]
  end
  subgraph api [API]
    FA[FastAPI]
    PR[Prisma client]
  end
  subgraph data [Data]
    PG[(PostgreSQL)]
    MEM[Session ledger and global snapshot]
  end
  UI -->|JWT REST /api proxy| FA
  FA --> PR --> PG
  FA --> MEM
```

| Layer | Stack |
|-------|--------|
| **API** | FastAPI, Pydantic, JWT, Prisma (Python) |
| **UI** | React 19, Vite, Tailwind (`financial-control-ui/`) |
| **ML / rules** | scikit-learn, custom credit / fraud helpers |
| **Simulation** | Monte Carlo over ledger-derived dynamics |
| **Voice / NL** | langdetect, deep-translator, gTTS, optional OpenAI Whisper + chat |
| **Integrations** | Razorpay SDK, Meta WhatsApp Graph, Twilio Voice |
| **OCR** | PyMuPDF, Pillow, Google Vision or Tesseract |
| **DB** | PostgreSQL — users, profiles, inventory, documents, RL state, etc. |

---

## Data model (high level)

Persistent entities (see `backend/prisma/schema.prisma`):

- **Users** — auth identity  
- **OnboardingProfile / BusinessProfile** — business context for the twin  
- **LedgerTransaction** (`transactions` table) — persisted movements (ingestion, webhooks, AA); list/summary/export via `GET /transactions/ledger*`  
- **Predictions / actions / executions** — financial and decision trace  
- **Customers** — receivable-oriented records  
- **Documents** — OCR pipeline outputs  
- **InventoryItem / KhataUpload** — stock and paper khata  
- **RlState** — learning metadata  

The **live cash / risk / collection queue** in the demo is also driven by an **in-memory snapshot** updated by the engine (fast path for hackathon demos); Prisma holds durable business state.

---

## What makes this different

| Typical SMB SaaS | This system |
|------------------|-------------|
| Static dashboards | **Decision + execution** loop |
| English-only analytics | **Hindi / Hinglish / regional** assistant path |
| “Log in and see charts” | **“What do I do today?”** + optional one-tap actions |
| Assumes clean books | Built for **partial, messy, real** inputs |
| Passive | **Self-learning hooks (RL)** + real outbound adapters |

---

## Demo (2 minutes)

1. **Risk** — Snapshot shows stress horizon (e.g. cash shortage probability over N days).  
2. **Action** — “Collect from [top of collection queue]” with ₹ amount.  
3. **Execute** — Generate **Razorpay link**; send **WhatsApp** reminder (live with Meta keys); **call** (Twilio when configured).  
4. **Voice** — Open **`/assistant`**, choose **हिंदी**, ask: *“Mujhe kya karna chahiye?”*  
5. **Today screen** — **`/`** shows one-line risk + one action + WhatsApp / Call / System buttons.

---

## Setup

### Prerequisites

- Python **3.11+** · Node **18+** · **PostgreSQL** (Docker recommended)  

### Backend

```bash
git clone https://github.com/shrijatewari/smb-ai-financial-autopilot.git
cd smb-ai-financial-autopilot/backend
docker compose up -d
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
export PATH="$(pwd)/.venv/bin:$PATH"
./scripts/sync-prisma-db.sh
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API docs: http://127.0.0.1:8000/docs  
- Optional: `python scripts/seed_mock_data.py` for demo DB rows  

### Frontend

```bash
cd ../financial-control-ui
npm install
npm run dev
```

Open **http://localhost:5173** — Vite proxies `/api` → backend (see `vite.config.js`).

**Auth:** sign up → complete **onboarding** → app unlocks.

### Deploy UI (Vercel)

Root **`vercel.json`** builds `financial-control-ui/`. Set **`VITE_API_URL`** in Vercel to your **HTTPS API origin** (no trailing slash). Backend needs a long-running host (Railway, Render, Fly, VPS) + Postgres — not Vercel serverless.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fshrijatewari%2Fsmb-ai-financial-autopilot&root-directory=.)

---

## Environment (summary)

| File | Purpose |
|------|---------|
| `backend/.env` | `DATABASE_URL`, JWT, Razorpay, WhatsApp, Twilio, OpenAI (optional), engine tuning |
| `financial-control-ui/.env` | Production: `VITE_API_URL` pointing at your API origin |

Copy from each **`.env.example`**. Never commit secrets.

---

## Future work

- Deeper **Paytm / bank** integrations  
- **Razorpay webhooks** → auto-post settlements into ledger  
- Richer **RL** policies and evaluation  
- **Credit / lending** scoring APIs  
- More **regional languages** end-to-end  
- SSE / WebSocket for **push** snapshots instead of polling  

---

## Vision

**Build an AI financial operating system so millions of SMBs can make better cash decisions every day — without needing a finance degree or English-first dashboards.**

---

## Reference

| Topic | Where |
|-------|--------|
| Backend route details & persisted ledger | `backend/README.md` |
| Frontend ledger / `api.js` | `financial-control-ui/README.md` |
| Vercel deploy (UI) | Root `vercel.json` — set `VITE_API_URL` to your API |
| Prisma | `backend/prisma/schema.prisma`, `./scripts/sync-prisma-db.sh` |
| Troubleshooting | Prisma on `PATH`, DB up, onboarding completed — see legacy notes in git history if needed |

**License:** Add a `LICENSE` when you open-source; until then all rights reserved unless stated otherwise.

**Author:** [@shrijatewari](https://github.com/shrijatewari) · **`smb-ai-financial-autopilot`**
