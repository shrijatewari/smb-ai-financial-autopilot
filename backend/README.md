# SMB AI Financial Autopilot – Backend API

FastAPI service: JWT auth, Prisma/PostgreSQL persistence, business onboarding, transaction ingestion (CSV/SMS/Paytm mock), document OCR, inventory & khata, RL hooks, compliance stubs, and a **background system engine** that publishes live snapshots for `GET /system/state`.

---

## Quick start

### Option A – from repository root

```bash
chmod +x scripts/start_backend.sh
# Ensure Postgres is up (see below) and backend/.env exists
./scripts/start_backend.sh
```

### Option B – manual (from `backend/`)

```bash
python3 -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

docker compose up -d           # PostgreSQL 16 on localhost:5432
cp .env.example .env           # edit DATABASE_URL / secrets

export PATH="$(pwd)/.venv/bin:$PATH"
./scripts/sync-prisma-db.sh    # db push + generate; fixes "prisma-client-py not found" via PATH

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **OpenAPI:** http://127.0.0.1:8000/docs  
- **Health:** `GET /health`  
- **Entry:** `main.py` (also `app.py` re-exports for `uvicorn app:app`)

---

## PostgreSQL & Prisma

| Item | Location / notes |
|------|------------------|
| Schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/` (baseline + `migration_lock.toml`) |
| Python client | Generated into `.venv` – run `prisma generate` after schema changes |
| Sync script | `./scripts/sync-prisma-db.sh` (sets `PATH` so **`prisma-client-py`** is found) |

Default Docker credentials (see `docker-compose.yml`):

```env
DATABASE_URL=postgresql://smb:smb@localhost:5432/smb_ai
```

**Important:** Always include `.venv/bin` in `PATH` when running Prisma CLI, or the generator subprocess fails with `prisma-client-py: command not found`.

---

## Where data lives

| Concern | Storage |
|---------|---------|
| Users, passwords (hashed) | PostgreSQL `users` |
| Onboarding form + engine snapshot JSON | `onboarding_profiles` |
| Normalized KPIs for judges / dashboard | `business_profiles` (upserted on `POST /onboarding`) |
| Inventory SKUs, khata photo rows | Prisma models `InventoryItem`, `KhataUpload` |
| **Persisted ledger** | PostgreSQL `transactions` (`LedgerTransaction`) – Razorpay webhooks, AA, SMS→Prisma, CSV paths; queried via `GET /transactions/ledger*` |
| Predictions, actions, executions | Prisma models + engine trace |
| Live cash / risk / collection queue | In-memory **global snapshot** + engine – exposed on `GET /system/state` |
| RL Q-table (optional) | `data/rl_qtable.json` (gitignored) |

---

## Notable HTTP routes

| Prefix | Role |
|--------|------|
| `/auth` | `signup`, `login`, `me` |
| `/onboarding` | GET/POST business profile (persisted) |
| `/system/state` | Live dashboard snapshot (JWT optional but required for per-user modules) |
| `/transactions` | Upload, SMS ingest, Paytm mock, persisted ledger – see **Persisted ledger** below |
| `/execute` | `payment-link` (optional `description`), `whatsapp` (link embedded; returns `payment_link`), **`collect`** (link + WhatsApp in one call), `call`, `twilio-call`, `action` |
| `/documents` | Multipart upload → OCR → profile merge |
| `/inventory` | Stock + khata sale application; items include **`stock_ceiling`** for stock % UI |
| `/bills` | **`ingest-json`**, **`ingest-ocr`**, **`history`**, **`{id}/detail`**, **`{id}/file`** – JWT; updates inventory + ledger |
| `/compliance/gst` | GST stub from onboarding |
| `/gst/summary` | **GST liability forecast** (GSTIN, due date, filing warning) – auth |
| `/notifications` | **Notification log** (morning brief attempts, etc.) – auth |
| `/assistant` | NL queries |
| `/dashboard` | Legacy aggregate snapshot |
| `/v1/dashboard` | Legacy path |

Full list: **Swagger** at `/docs`.

---

## Persisted ledger (`GET /transactions/ledger*`)

`LedgerTransaction` rows are stored in PostgreSQL (`transactions` table). Three authenticated endpoints share **filter semantics**; only the list endpoint supports **sort** and **pagination**. Export applies the same filters and returns up to **50,000** rows per request (default **10,000**; see OpenAPI for `limit`).

### Query parameters

| Parameter | `GET /transactions/ledger` | `GET /transactions/ledger/summary` | `GET /transactions/ledger/export` |
|-----------|:--------------------------:|:----------------------------------:|:---------------------------------:|
| `date_from`, `date_to` | ✓ | ✓ | ✓ |
| `q` | ✓ | ✓ | ✓ |
| `source` | ✓ | ✓ | ✓ |
| `category` | ✓ | ✓ | ✓ |
| `txn_type` | ✓ | ✓ | ✓ |
| `sort` | ✓ | – | ✓ |
| `offset`, `limit` | ✓ | – | export: own `limit` (not `offset`) |

- **Dates:** inclusive `YYYY-MM-DD`, UTC day bounds.  
- **`q`:** case-insensitive substring on `description` (max 200 characters).  
- **`source` / `category`:** exact match, case-insensitive (max 32 characters).  
- **`txn_type`:** `credit` or `debit`.  
- **`sort`:** `date_desc` (default), `date_asc`, `amount_desc`, `amount_asc`.  
- **List:** JSON includes `total`, `offset`, `limit`, and echoes applied filters.  
- **Summary:** raw SQL aggregates – count, `total_credit`, `total_debit`, `net`.  
- **Export:** UTF-8 CSV with BOM; filename suffix reflects active filters.

```mermaid
flowchart TB
  subgraph req [Client request]
    P["Query string\nfilters + optional sort"]
  end
  subgraph list [List]
    L["find_many\norder + skip/take"]
  end
  subgraph sum [Summary]
    R["query_raw\nSUM/COUNT"]
  end
  subgraph exp [Export]
    C["find_many\nordered rows → CSV"]
  end
  DB[("PostgreSQL\ntransactions")]
  P --> L --> DB
  P --> R --> DB
  P --> C --> DB
```

---

## WhatsApp (Meta Cloud API)

`services/whatsapp_service.py`:

- If **`WHATSAPP_PHONE_NUMBER_ID`** and **`WHATSAPP_ACCESS_TOKEN`** are set → real **Graph API** `POST .../messages`.
- Else → simulated success (`mock: true`).

Env template and setup notes: **`.env.example`**.

---

## OCR & documents

- Optional **Google Cloud Vision** via `GOOGLE_APPLICATION_CREDENTIALS` (JSON path) or API key.
- **Tesseract** fallback if installed (`TESSERACT_CMD` / PATH).
- See `.env.example` for variables.

---

## Razorpay & collections

- **`POST /execute/payment-link`** – creates a Payment Link (SDK or REST `POST /v1/payment_links`); optional **`description`**; mock `https://rzp.io/i/plink_*` when keys are absent.  
- **`POST /execute/whatsapp`** / **`POST /execute/collect`** – build the same Razorpay link for the amount, append to WhatsApp body (shop-aware copy), send via Meta or mock; response includes **`payment_link`** for clients.

---

## Development tips

- Restart uvicorn after `.env` changes.
- Use **`./scripts/sync-prisma-db.sh`** after pulling schema changes.
- For production, set **`JWT_SECRET_KEY`**, use long-lived DB credentials, and restrict CORS in `main.py` instead of `*`.

---

## Related documentation

- Monorepo overview (includes persisted ledger summary + diagram): **`../README.md`**
- Frontend Transactions / `api.js`: **`../financial-control-ui/README.md`**
