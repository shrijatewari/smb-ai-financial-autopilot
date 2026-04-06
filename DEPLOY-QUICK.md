# Get a public URL in ~5 minutes

The UI is a **static Vite build**. The API must be hosted separately (Railway, Render, Fly, etc.) – set `VITE_API_URL` to that API’s **https** origin (no trailing slash).

---

## Option A – Vercel CLI (fastest if GitHub import is broken)

```bash
cd /path/to/smb-ai-system
git pull
npx vercel@latest login
npx vercel@latest        # link project, accept defaults
# Add env when prompted, or in dashboard:
#   VITE_API_URL = https://your-api.example.com
npx vercel@latest --prod
```

Copy the **Production** URL (e.g. `https://something.vercel.app`).

**Important:** Deploy from **repo root** (where this `vercel.json` lives), not only `financial-control-ui/`, unless you use Option B.

---

## Option B – Vercel dashboard (subfolder only)

1. [vercel.com/new](https://vercel.com/new) → Import `smb-ai-financial-autopilot`.
2. **Root Directory** → `financial-control-ui` (click Edit).
3. Framework: **Vite** (auto).
4. Build: `npm run build` · Output: `dist`.
5. **Environment Variables** → `VITE_API_URL` = your API base URL.
6. Deploy.

---

## Option C – Netlify (alternative)

**If you see Netlify’s “Page not found” on the root URL:** the deploy folder was empty, wrong, or missing SPA fallback. This repo now includes `public/_redirects` (copied into `dist/`) and `netlify.toml`.

### CLI (manual `dist` upload)

```bash
cd financial-control-ui
npm install
npm run build
# dist/ must contain index.html AND _redirects
ls dist/
npx netlify-cli deploy --prod --dir=dist
```

### Git-connected site (dashboard)

1. **Site settings → Build & deploy → Continuous deployment**
2. **Base directory:** `financial-control-ui`
3. **Build command:** `npm run build`
4. **Publish directory:** `dist` (relative to base → `financial-control-ui/dist` from repo root)
5. **Environment:** `VITE_API_URL` = your API URL (no trailing slash)
6. Trigger **Deploy site**

Root `netlify.toml` also defines `base` + `publish` for monorepo builds from the repo root.

---

## If the app loads but API fails

- `VITE_API_URL` must be set **at build time** on Vercel (redeploy after changing it).
- API must allow **CORS** from your `*.vercel.app` domain (your FastAPI already uses `allow_origins=["*"]` in dev – confirm production).

---

## Smoke test locally (same as Vercel build)

```bash
cd financial-control-ui
npm install
npm run build
npx vite preview --host
```

Open the printed URL; set `VITE_API_URL` in `.env.production` or export for preview if needed.
