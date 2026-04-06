import axios from 'axios'
import { getMockNotificationsResponse } from '../lib/platformMocks'

/**
 * Base URL for the Financial Control backend.
 * - Dev (`npm run dev`): always same-origin `/api` – Vite proxies to `VITE_API_URL` or localhost:8000
 *   (see vite.config.js `loadEnv`). Avoids CORS and flaky client-side env injection.
 * - Prod build: `VITE_API_URL` (e.g. Netlify), or fallback localhost for broken previews.
 */
export function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return '/api'
  const env = import.meta.env.VITE_API_URL
  if (env) return String(env).replace(/\/$/, '')
  return 'http://localhost:8000'
}

/** EventSource URL for GET /system/stream (JWT in query – browsers cannot set SSE headers). */
export function getSystemStreamUrl(token) {
  const base = resolveApiBaseUrl().replace(/\/$/, '')
  return `${base}/system/stream?token=${encodeURIComponent(token)}`
}

/** Build absolute URL for backend-served files (e.g. /media/assistant_tts/*.mp3). */
export function resolveBackendMediaUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base = resolveApiBaseUrl().replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export const TOKEN_KEY = 'financial_control_token'

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const t = localStorage.getItem(TOKEN_KEY)
  if (t) {
    config.headers.Authorization = `Bearer ${t}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

/** User-facing message for failed requests (especially ERR_NETWORK / "Network Error"). */
export function getApiErrorMessage(err) {
  const detail = err?.response?.data?.detail
  if (detail != null) {
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  const status = err?.response?.status
  if (status === 502 || status === 504) {
    return (
      'Dev proxy could not reach the API. Set VITE_API_URL in financial-control-ui/.env (e.g. https://smb-financial-api.fly.dev), ' +
      'then stop and run `npm run dev` again from that folder.'
    )
  }
  const code = err?.code
  const msg = err?.message || ''
  if (code === 'ERR_NETWORK' || msg === 'Network Error') {
    if (import.meta.env.DEV) {
      return (
        'Cannot reach the API. Start the backend (e.g. port 8000), or set VITE_API_URL in financial-control-ui/.env ' +
        '(Vite proxies `/api` to that URL). Restart `npm run dev` after changing .env. ' +
        'Remote example: VITE_API_URL=https://smb-financial-api.fly.dev'
      )
    }
    return (
      'Cannot reach the API. Set VITE_API_URL to your API base URL at build time, or deploy the API behind the same origin as `/api`.'
    )
  }
  return msg || 'Request failed.'
}

const DEFAULT_QUERY = {
  initial_balance: 10000,
  horizon_days: 30,
}

/** Live control-plane snapshot (background engine, polled by the dashboard). */
export async function fetchSystemState() {
  const { data } = await api.get('/system/state')
  return data
}

/** Full product snapshot (optional; engine + GET /system/state is the live source of truth). */
export async function fetchDashboard(params = {}) {
  const { data } = await api.get('/dashboard', {
    params: { ...DEFAULT_QUERY, ...params },
  })
  return data
}

export async function fetchCashflowPrediction(params = {}) {
  const { data } = await api.get('/prediction/cashflow', {
    params: { ...DEFAULT_QUERY, ...params },
  })
  return data
}

export async function fetchSimulation(params = {}) {
  const { data } = await api.get('/simulation/run', {
    params: { ...DEFAULT_QUERY, paths: 1000, ...params },
  })
  return data
}

export async function fetchDecisions(params = {}) {
  const { data } = await api.get('/decision', {
    params: { ...DEFAULT_QUERY, ...params },
  })
  return data
}

export async function fetchGstCompliance() {
  const { data } = await api.get('/compliance/gst')
  return data
}

/** GET /gst/summary – GSTIN, next due date, estimated liability, Monte Carlo alignment fields. */
export async function fetchGstSummary() {
  const { data } = await api.get('/gst/summary')
  return data
}

/**
 * GET /notifications – NotificationLog rows (morning briefing sends, etc.).
 * On network/API failure, returns demo rows from `getMockNotificationsResponse()` so Profile still shows a table.
 */
export async function fetchNotifications(params = {}) {
  try {
    const { data } = await api.get('/notifications', { params })
    if (data && Array.isArray(data.items)) {
      return { ...data, _source: 'api' }
    }
    return { ...getMockNotificationsResponse(), _fallbackReason: 'invalid_response' }
  } catch {
    return getMockNotificationsResponse()
  }
}

export async function connectPaytm() {
  const { data } = await api.post('/connect/paytm')
  return data
}

export async function fetchPaytmTransactions() {
  const { data } = await api.get('/transactions/paytm')
  return data
}

/** Query keys shared by GET /ledger/summary and /ledger/export (same semantics as list filters, excluding sort/offset/limit). */
const LEDGER_SHARED_FILTER_KEYS = ['date_from', 'date_to', 'q', 'source', 'txn_type', 'category']

function pickLedgerSharedFilters(params = {}) {
  const clean = {}
  for (const k of LEDGER_SHARED_FILTER_KEYS) {
    const v = params[k]
    if (v != null && String(v).trim() !== '') clean[k] = typeof v === 'string' ? v.trim() : v
  }
  return clean
}

/**
 * GET /transactions/ledger – persisted Prisma rows (webhooks, AA, SMS, etc.).
 * Pass-through params: date_from, date_to, q, source, category, txn_type, sort (date_desc default – omitted when default),
 * offset, limit.
 */
export async function fetchLedgerTransactions(params = {}) {
  const clean = { ...params }
  if (clean.sort === 'date_desc' || !clean.sort) delete clean.sort
  const { data } = await api.get('/transactions/ledger', { params: clean })
  return data
}

/** GET /transactions/ledger/summary – count + credit/debit totals + net (same shared filters as ledger; no sort/offset/limit). */
export async function fetchLedgerSummary(params = {}) {
  const clean = pickLedgerSharedFilters(params)
  const { data } = await api.get('/transactions/ledger/summary', { params: clean })
  return data
}

/** GET /transactions/ledger/export – CSV download (auth). Shared filters + optional sort (non-default). */
export async function downloadLedgerCsv(params = {}) {
  const clean = pickLedgerSharedFilters(params)
  if (params.sort && params.sort !== 'date_desc') clean.sort = params.sort
  const res = await api.get('/transactions/ledger/export', { responseType: 'blob', params: clean })
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const from = clean.date_from || 'all'
  const to = clean.date_to || 'all'
  const qpart = clean.q ? `_${String(clean.q).slice(0, 32).replace(/[^\w\u0900-\u0fff-]+/g, '_')}` : ''
  const spart = clean.source ? `_${String(clean.source).slice(0, 24).replace(/[^\w-]+/g, '_')}` : ''
  const tpart = clean.txn_type ? `_${clean.txn_type}` : ''
  const sortpart = clean.sort && clean.sort !== 'date_desc' ? `_${clean.sort}` : ''
  const catpart = clean.category
    ? `_${String(clean.category).slice(0, 24).replace(/[^\w-]+/g, '_')}`
    : ''
  a.download = `ledger_export_${from}_${to}${qpart}${spart}${tpart}${sortpart}${catpart}.csv`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * POST /execute/action – simulated Paytm-style execution.
 */
export async function executeAction(body) {
  const { data } = await api.post('/execute/action', body)
  return data
}

/** POST /execute/payment-link – Razorpay payment link (live if keys set). */
export async function postPaymentLink(body) {
  const { data } = await api.post('/execute/payment-link', body)
  return data
}

/** POST /execute/whatsapp – payment reminder + Razorpay link in body; Meta or mock send (tone: friendly|formal). */
export async function postWhatsappReminder(body) {
  const { data } = await api.post('/execute/whatsapp', body)
  return data
}

/** POST /execute/collect – payment link + WhatsApp in one call; response includes payment_link + preview. */
export async function postExecuteCollect(body) {
  const { data } = await api.post('/execute/collect', body)
  return data
}

/** POST /execute/call – simulated AI call script + likelihood. */
export async function postCallSimulation(body) {
  const { data } = await api.post('/execute/call', body)
  return data
}

/** POST /execute/twilio-call – real Hindi TTS call when TWILIO_* env is set. */
export async function postTwilioVoiceCall(body) {
  const { data } = await api.post('/execute/twilio-call', body)
  return data
}

/** POST /transactions/sms – parse UPI/bank SMS text into the ledger. */
export async function postSmsIngest(message) {
  const { data } = await api.post('/transactions/sms', { message })
  return data
}

export async function signup({ name, email, password, referral_code }) {
  const body = { name, email, password }
  if (referral_code && String(referral_code).trim()) {
    body.referral_code = String(referral_code).trim().toUpperCase()
  }
  const { data } = await api.post('/auth/signup', body)
  return data
}

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data
}

/** PATCH /auth/me – trusted helper phone + optional approval gate (demo). */
export async function patchMe(body) {
  const { data } = await api.patch('/auth/me', body)
  return data
}

/** GET /aa/status – latest Account Aggregator consent for the signed-in user. */
export async function getAaStatus() {
  const { data } = await api.get('/aa/status')
  return data
}

/** POST /aa/initiate – start AA consent; open `redirect_url` in a new tab. */
export async function postAaInitiate(body = {}) {
  const { data } = await api.post('/aa/initiate', body)
  return data
}

/** POST /sms/commands – SMS-style BAL / RISK / PAY (authenticated; Twilio can proxy here). */
export async function postSmsCommand(text) {
  const { data } = await api.post('/sms/commands', { text })
  return data
}

export async function submitOnboarding(payload) {
  const { data } = await api.post('/onboarding', payload)
  return data
}

export async function getOnboardingState() {
  const { data } = await api.get('/onboarding')
  return data
}

/** POST /documents/upload – PDF/images → OCR → business profile (updates engine context). */
export async function uploadDocuments(files) {
  const form = new FormData()
  for (const f of files) {
    form.append('files', f)
  }
  const { data } = await api.post('/documents/upload', form, {
    timeout: 120000,
  })
  return data
}

/** GET /documents/profile – latest OCR-derived profile for the signed-in user. */
export async function fetchDocumentProfile() {
  const { data } = await api.get('/documents/profile')
  return data
}

/** POST /user/interaction – RL rewards / module personalization (dismiss, module_click, alert_view). */
export async function postUserInteraction(payload) {
  const { data } = await api.post('/user/interaction', payload)
  return data
}

/**
 * POST /assistant/query – intent + NL response; multilingual when `language` is set (hi, ta, …).
 * Options: language, tone (formal|friendly), include_audio (MP3 URL in response).
 */
export async function postAssistantQuery(textOrPayload, options = {}) {
  const { language, tone, include_audio, ...queryParams } = options
  const body =
    typeof textOrPayload === 'string'
      ? { query: textOrPayload, language, tone, include_audio }
      : { ...textOrPayload }
  const clean = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined && v !== '')
  )
  const { data } = await api.post('/assistant/query', clean, {
    params: { initial_balance: DEFAULT_QUERY.initial_balance, ...queryParams },
  })
  return data
}

/** GET /inventory/items – per-user stock (SKU). */
export async function fetchInventoryItems() {
  const { data } = await api.get('/inventory/items')
  return data
}

/** POST /inventory/items */
export async function createInventoryItem(body) {
  const { data } = await api.post('/inventory/items', body)
  return data
}

/** PATCH /inventory/items/:id – adjust quantity or reorder threshold. */
export async function patchInventoryItem(itemId, body) {
  const { data } = await api.patch(`/inventory/items/${itemId}`, body)
  return data
}

/** POST /inventory/khata/upload – save khata page photo. */
export async function uploadKhataPhoto(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/inventory/khata/upload', form)
  return data
}

/** POST /inventory/khata/apply – deduct stock + credit cash ledger. */
export async function applyKhataSale(payload) {
  const { data } = await api.post('/inventory/khata/apply', payload)
  return data
}

/** GET /credit/score – SMB credit signal (0–1000). */
export async function fetchCreditScore(refresh = false) {
  const { data } = await api.get('/credit/score', { params: { refresh } })
  return data
}

/** GET /rl/debug – last Q-learning transition + ε (policy + Q-table live on the server). */
export async function fetchRlDebug() {
  const { data } = await api.get('/rl/debug')
  return data
}

/** GET /growth/summary – subscription tier, referral code, counts. */
export async function fetchGrowthSummary() {
  const { data } = await api.get('/growth/summary')
  return data
}

/** POST /growth/subscription – demo tier switch when GROWTH_ALLOW_TIER_OVERRIDE is on. */
export async function postGrowthSubscription(tier) {
  const { data } = await api.post('/growth/subscription', { tier })
  return data
}

/** GET /growth/benchmarks – peer percentiles for your industry. */
export async function fetchGrowthBenchmarks() {
  const { data } = await api.get('/growth/benchmarks')
  return data
}

/** POST /growth/benchmarks/refresh – recompute aggregates (ops / demo). */
export async function postGrowthBenchmarksRefresh() {
  const { data } = await api.post('/growth/benchmarks/refresh')
  return data
}

/** GET /collections/ladder – active 14-day collection campaigns. */
export async function fetchCollectionLadders() {
  const { data } = await api.get('/collections/ladder')
  return data
}

/** GET /collections/customers – receivable rows for ladder start. */
export async function fetchCollectionCustomers() {
  const { data } = await api.get('/collections/customers')
  return data
}

/** POST /bills/ingest-json – POS JSON bill → inventory + ledger + optional khaata. */
export async function ingestBillJson(payload) {
  const { data } = await api.post('/bills/ingest-json', payload)
  return data
}

/** POST /bills/ingest-ocr – multipart PDF/image → OCR + same ingest pipeline. */
export async function ingestBillOcr(file, udhar = false) {
  const form = new FormData()
  form.append('file', file)
  form.append('udhar', udhar ? 'true' : 'false')
  const { data } = await api.post('/bills/ingest-ocr', form, { timeout: 120000 })
  return data
}

/** GET /bills/history – last 20 bills. */
export async function getBillHistory() {
  const { data } = await api.get('/bills/history')
  return data
}

/** GET /bills/:id/detail – itemized bill for UI proof. */
export async function getBillDetail(billId) {
  const { data } = await api.get(`/bills/${billId}/detail`)
  return data
}

/** POST /collections/ladder/start */
export async function postCollectionLadderStart(customerId) {
  const { data } = await api.post('/collections/ladder/start', { customer_id: customerId })
  return data
}

/** GET /insights/suppliers – payables concentration. */
export async function fetchSupplierInsights() {
  const { data } = await api.get('/insights/suppliers')
  return data
}

/** GET /inventory/khata/:id/image – blob for preview (auth header). */
export async function fetchKhataImageBlob(uploadId) {
  const res = await api.get(`/inventory/khata/${uploadId}/image`, { responseType: 'blob' })
  return res.data
}
