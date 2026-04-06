# Video demo script – SMB AI / Financial Control Twin

Use this as a **spoken narration + click plan** while screen-recording. Adjust timing to your pace (~8–15 minutes full tour; ~4 minutes “hero” cut).

---

## Before you record

1. **Environment**
   - Terminal 1: `cd backend && source .venv/bin/activate  # or .venv\Scripts\activate on Windows`  
     `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
   - Terminal 2: `cd financial-control-ui && npm run dev`
   - Browser: open `http://localhost:5173` (or the URL Vite prints). Ensure `/api` proxies to `:8000` if you use the default Vite setup.

2. **Account**
   - Use a **demo account** that has already completed onboarding (documents + business profile) so you land on **Today** without redirects.
   - Optional: toggle **Advanced** mode in the top bar to show the full sidebar during the tour.

3. **Recording**
   - 1920×1080, browser zoom **100%**, hide bookmarks bar if cluttered.
   - Close unrelated tabs; use a clean desktop or blur background if using webcam.
   - **Pause 2 seconds** after each navigation so cuts are easy.

4. **Privacy**
   - Use fake emails/phones in profile if the recording is public.

---

## Suggested story arc (order of pages)

| Segment | Route | Purpose |
|--------|--------|---------|
| 1 | Login → home | Access + first impression |
| 2 | `/` Today | Hero: stats bar, queue, actions, ⌘K |
| 3 | `/people` | Full dues list |
| 4 | `/dashboard` | Full financial dashboard |
| 5 | `/transactions` | Ledger |
| 6 | `/cash-flow` | Cash flow view |
| 7 | `/inventory` | Stock / khata |
| 8 | `/predictions` | Forecasts |
| 9 | `/risk` | Risk / simulation |
| 10 | `/gst` | GST summary |
| 11 | `/actions` | Action center |
| 12 | `/profile` | Settings, briefing, WhatsApp |
| 13 | `/growth` | Credit, subscription, referrals, ladder |
| 14 | `/documents` | Smart upload |
| 15 | `/onboarding` | Shown only if you need “first-time” story |
| 16 | `/assistant` | AI chat / voice |
| 17 | `/platform` | Platform lab / capabilities |

---

## Page-by-page script

### Login (`/login`)

**Say:**  
“This is the login for the SMB financial control twin – one place for cash, collections, GST, and automation.”

**Do:** Enter email/password → Login.

**Cut:** Jump cut to post-login if you prefer not to show credentials.

---

### Today – Aaj (`/`)

**Say:**  
“This is **Aaj** – the owner’s daily home. At a glance: **runway**, **receivables**, and **today’s inflow** from the ledger; the runway meter shows how safe the cash position is.”

**Do:** Scroll slightly. Point at the three stat chips and the gradient meter.

**Say:**  
“Below that is the **full collection queue** – ranked customers with late-payment risk and WhatsApp or call on every row.”

**Do:** Tap one row to open the **timeline** (past touch, today’s step, future ladder). Close modal.

**Say:**  
“The big buttons still drive the **top engine priority** – WhatsApp, Hindi voice call, or a system payment link.”

**Do:** Press **⌘K** (Mac) or **Ctrl+K** (Windows). Type “GST” or a customer name.

**Say:**  
“**Command palette** – jump to any page or message a customer without hunting through menus.”

**Do:** Close palette (Esc). Optionally point at the **Upgrade** strip if on free tier.

**Time:** ~90–120 s

---

### People / dues (`/people`)

**Say:**  
“**Log / Dues** is the same collection queue in a focused view – good for follow-up day.”

**Do:** Scroll list; show WA/Call; open timeline once.

**Time:** ~30 s

---

### Full dashboard (`/dashboard`)

**Say:**  
“**Advanced** mode unlocks the full dashboard – live simulation, charts, and the same control-plane snapshot the engine updates.”

**Do:** Pan slowly; mention one chart or widget.

**Time:** ~45 s

---

### Transactions (`/transactions`)

**Say:**  
“Ledger view – everything ingested: SMS, UPI, Razorpay, bank exports – with filters and CSV export.”

**Do:** Apply a filter or scroll; optional export if safe.

**Time:** ~30 s

---

### Cash flow (`/cash-flow`)

**Say:**  
“Cash flow view – how money moves over time, aligned with the twin’s forecast.”

**Do:** Scroll or highlight one period.

**Time:** ~25 s

---

### Inventory (`/inventory`)

**Say:**  
“SKU inventory and khata-style photo capture – ties stock to collections when you sell.”

**Do:** Show list or one upload flow briefly.

**Time:** ~30 s

---

### Predictions (`/predictions`)

**Say:**  
“**Andaza** – predictions and scenarios on top of the reconstructed books.”

**Do:** Point at one metric.

**Time:** ~25 s

---

### Risk (`/risk`)

**Say:**  
“Risk page – Monte Carlo and stress-style view of cash paths; complements the runway on Today.”

**Do:** Scroll once.

**Time:** ~25 s

---

### GST (`/gst`)

**Say:**  
“GST summary – GSTIN, next due date, estimated liability when connected; filing warnings surface on **Today** too.”

**Do:** Show summary card.

**Time:** ~30 s

---

### Action center (`/actions`)

**Say:**  
“Action center – suggested actions and execution history – collect, defer, pay.”

**Do:** Show list or empty state.

**Time:** ~25 s

---

### Profile (`/profile`)

**Say:**  
“Profile – business identity, **WhatsApp** number for briefings, trusted helper, **notification log** for briefing sends.”

**Do:** Scroll; open briefing log anchor if present (`#profile-notifications`).

**Time:** ~45 s

---

### Growth (`/growth`)

**Say:**  
“**Growth** – credit score for lenders, subscription tier, referral code, **14-day collection ladder**, payables insight, and peer benchmarks.”

**Do:** Show credit band; copy referral code; optional tier button.

**Time:** ~45 s

---

### Documents (`/documents`)

**Say:**  
“**Documents** – drop bank statements, GST invoices, or bills; OCR fills profile tags and summary stats after analyze.”

**Do:** Drag a **demo PDF** or skip if already processed – show **success** panel with tags and anomaly hint count.

**Time:** ~40 s

---

### Onboarding (`/onboarding`)

**Say:**  
“First-time users upload documents and complete the business profile so the twin knows the sector and cash mix.”

**Do:** Only if recording a “first run” video; otherwise skip.

**Time:** ~30 s

---

### Assistant (`/assistant`)

**Say:**  
“AI assistant – natural language in Hindi or English; can tie into balances and next actions.”

**Do:** Send one short question; optional voice.

**Time:** ~40 s

---

### Platform lab (`/platform`)

**Say:**  
“Platform lab – capability map and integration status for demos and technical buyers.”

**Do:** Scroll module list.

**Time:** ~30 s

---

## One-line “elevator” close

**Say:**  
“That’s the SMB financial twin – daily cash and collections first, full ledger and GST, with AI and growth tools when you’re ready to scale.”

**Do:** Land on **Today** or **Growth**; fade or stop recording.

---

## Optional “short” cut (4 minutes)

1. Login → **Today** (stats + queue + ⌘K) – 90 s  
2. **People** – 20 s  
3. **Transactions** – 20 s  
4. **GST** – 20 s  
5. **Growth** – 40 s  
6. **Assistant** – 30 s  
7. Close on **Today** – 10 s  

---

## Checklist

- [ ] Backend + frontend running  
- [ ] Demo user with completed onboarding  
- [ ] Sample PDF for Documents (optional)  
- [ ] Advanced mode on for full nav  
- [ ] Mic levels checked if narrating  
