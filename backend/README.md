# SMB AI Financial Autopilot — Backend API

FastAPI service: JWT auth, Prisma/PostgreSQL persistence, business onboarding, transaction ingestion (CSV/SMS/Paytm mock), document OCR, inventory & khata, RL hooks, compliance stubs, and a **background system engine** that publishes live snapshots for `GET /system/state`.

---

## Quick start

### Option A — from repository root

```bash
chmod +x scripts/start_backend.sh
# Ensure Postgres is up (see below) and backend/.env exists
./scripts/start_backend.sh
```

### Option B — manual (from `backend/`)

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
| Python client | Generated into `.venv` — run `prisma generate` after schema changes |
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
| Ledger-style rows (optional future wiring) | Tables like `transactions`, `predictions`, `actions`, etc. — schema ready; ingestion may still use session/engine paths |
| Live cash / risk / collection queue | In-memory **global snapshot** + engine — exposed on `GET /system/state` |
| RL Q-table (optional) | `data/rl_qtable.json` (gitignored) |

---

## Notable HTTP routes

| Prefix | Role |
|--------|------|
| `/auth` | `signup`, `login`, `me` |
| `/onboarding` | GET/POST business profile (persisted) |
| `/system/state` | Live dashboard snapshot (JWT optional but required for per-user modules) |
| `/transactions` | Upload, SMS ingest, Paytm mock |
| `/execute` | `payment-link`, `whatsapp`, `call`, `action` |
| `/documents` | Multipart upload → OCR → profile merge |
| `/inventory` | Stock + khata sale application |
| `/compliance/gst` | GST stub from onboarding |
| `/assistant` | NL queries |
| `/dashboard` | Legacy aggregate snapshot |
| `/v1/dashboard` | Legacy path |

Full list: **Swagger** at `/docs`.

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

## Razorpay

Payment links from `POST /execute/payment-link` when **`RAZORPAY_KEY_ID`** and **`RAZORPAY_KEY_SECRET`** are set; otherwise structured mock responses.

---

## Development tips

- Restart uvicorn after `.env` changes.
- Use **`./scripts/sync-prisma-db.sh`** after pulling schema changes.
- For production, set **`JWT_SECRET_KEY`**, use long-lived DB credentials, and restrict CORS in `main.py` instead of `*`.

---

## Related documentation

- Monorepo overview: **`../README.md`**
- Frontend: **`../financial-control-ui/README.md`**
