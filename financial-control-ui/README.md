# Financial Control UI

React + Vite + Tailwind single-page app for the **SMB AI Financial Autopilot** product: dashboard, auth, onboarding (required before main routes), transactions, cash flow, inventory / khata, risk, GST, documents, assistant, and profile.

---

## Requirements

- **Node.js** 18+ (20+ recommended)
- **npm** (ships with Node)
- Running **backend** API (default `http://localhost:8000`) — see repository root `README.md` and `../backend/README.md`

---

## Install & run (development)

```bash
cd financial-control-ui
npm install
npm run dev
```

Vite defaults to **http://localhost:5173** (see `vite.config.js`).

### API base URL

| Mode | Behavior |
|------|----------|
| **Dev (recommended)** | Leave `VITE_API_URL` **unset**. The dev server **proxies** `/api` → `http://localhost:8000` and strips the `/api` prefix so the frontend can call `axios` with `baseURL: '/api'` (see `src/services/api.js`). |
| **Production / preview** | Set `VITE_API_URL` to your API origin (no trailing slash), e.g. `https://api.example.com`. |

Copy `.env.example` to `.env` or `.env.local` only when you need to override:

```bash
cp .env.example .env.local
# Uncomment and set VITE_API_URL=... if not using the dev proxy
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Hot-reload dev server with `/api` proxy |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally (set `VITE_API_URL` if API is not proxied) |

---

## Authentication

- Token stored in **`localStorage`** under key `financial_control_token` (see `src/services/api.js`).
- **`AuthProvider`** (`src/context/AuthContext.jsx`) loads `GET /auth/me` on startup; user must have **`onboarding_completed: true`** before protected routes (except `/onboarding`) — enforced in `src/layout/ProtectedLayout.jsx`.
- Logout clears token and user state.

---

## Project structure (selected)

```text
src/
├── components/       # Dashboard, shared UI (e.g. ui/card)
├── context/          # AuthContext
├── layout/           # AppShell, Sidebar, ProtectedLayout
├── pages/            # Login, Signup, Onboarding, Transactions, Inventory, ...
├── services/api.js   # Axios instance, all API helpers
└── App.jsx           # Routes
```

---

## Styling

- **Tailwind CSS v4** with `@tailwindcss/vite`
- Brand accent: violet / `#6C3BFF` (see components)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Network Error` / cannot reach API | Start backend on port **8000**; in dev, do **not** set `VITE_API_URL` unless you know the full URL |
| CORS errors in browser | Backend allows `*` for dev; if you bypass proxy, configure CORS or use same-origin deployment |
| Stuck on onboarding after saving | Backend must persist onboarding and return `onboarding_completed: true` on `GET /auth/me`; call refresh / re-login |
| Build fails | Run `npm install` again; ensure Node 18+ |

---

## Related docs

- Repository overview: **`../README.md`**
- API & database: **`../backend/README.md`**
- OpenAPI: `http://localhost:8000/docs` when the backend is running
