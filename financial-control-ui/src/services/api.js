import axios from 'axios'

/**
 * Base URL for the Financial Control backend.
 * - Dev: use `/api` so Vite proxies to the backend (see vite.config.js).
 * - Prod: set VITE_API_URL, or deploy API behind the same origin at `/api`.
 */
function resolveApiBaseUrl() {
  const env = import.meta.env.VITE_API_URL
  if (env) return String(env).replace(/\/$/, '')
  // `npm run dev`: use Vite proxy → backend (avoids direct :8000 connection issues).
  if (import.meta.env.DEV) return '/api'
  // `npm run build` + `vite preview` or static hosting: point at API (set VITE_API_URL in real deploys).
  return 'http://localhost:8000'
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
  const code = err?.code
  const msg = err?.message || ''
  if (code === 'ERR_NETWORK' || msg === 'Network Error') {
    return (
      'Cannot reach the API. Start the backend: cd backend && uvicorn main:app --reload --port 8000 ' +
      '(then keep using npm run dev so /api proxies to it). Or set VITE_API_URL to your API base URL.'
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

export async function connectPaytm() {
  const { data } = await api.post('/connect/paytm')
  return data
}

export async function fetchPaytmTransactions() {
  const { data } = await api.get('/transactions/paytm')
  return data
}

/**
 * POST /execute/action — simulated Paytm-style execution.
 */
export async function executeAction(body) {
  const { data } = await api.post('/execute/action', body)
  return data
}

/** POST /execute/payment-link — Razorpay payment link (live if keys set). */
export async function postPaymentLink(body) {
  const { data } = await api.post('/execute/payment-link', body)
  return data
}

/** POST /execute/whatsapp — payment reminder text + simulated send (tone: friendly|formal). */
export async function postWhatsappReminder(body) {
  const { data } = await api.post('/execute/whatsapp', body)
  return data
}

/** POST /execute/call — simulated AI call script + likelihood. */
export async function postCallSimulation(body) {
  const { data } = await api.post('/execute/call', body)
  return data
}

/** POST /execute/twilio-call — real Hindi TTS call when TWILIO_* env is set. */
export async function postTwilioVoiceCall(body) {
  const { data } = await api.post('/execute/twilio-call', body)
  return data
}

/** POST /transactions/sms — parse UPI/bank SMS text into the ledger. */
export async function postSmsIngest(message) {
  const { data } = await api.post('/transactions/sms', { message })
  return data
}

export async function signup({ name, email, password }) {
  const { data } = await api.post('/auth/signup', { name, email, password })
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

export async function submitOnboarding(payload) {
  const { data } = await api.post('/onboarding', payload)
  return data
}

export async function getOnboardingState() {
  const { data } = await api.get('/onboarding')
  return data
}

/** POST /documents/upload — PDF/images → OCR → business profile (updates engine context). */
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

/** GET /documents/profile — latest OCR-derived profile for the signed-in user. */
export async function fetchDocumentProfile() {
  const { data } = await api.get('/documents/profile')
  return data
}

/** POST /user/interaction — RL rewards / module personalization (dismiss, module_click, alert_view). */
export async function postUserInteraction(payload) {
  const { data } = await api.post('/user/interaction', payload)
  return data
}

/**
 * POST /assistant/query — intent + NL response; multilingual when `language` is set (hi, ta, …).
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

/** GET /inventory/items — per-user stock (SKU). */
export async function fetchInventoryItems() {
  const { data } = await api.get('/inventory/items')
  return data
}

/** POST /inventory/items */
export async function createInventoryItem(body) {
  const { data } = await api.post('/inventory/items', body)
  return data
}

/** PATCH /inventory/items/:id — adjust quantity or reorder threshold. */
export async function patchInventoryItem(itemId, body) {
  const { data } = await api.patch(`/inventory/items/${itemId}`, body)
  return data
}

/** POST /inventory/khata/upload — save khata page photo. */
export async function uploadKhataPhoto(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/inventory/khata/upload', form)
  return data
}

/** POST /inventory/khata/apply — deduct stock + credit cash ledger. */
export async function applyKhataSale(payload) {
  const { data } = await api.post('/inventory/khata/apply', payload)
  return data
}

/** GET /inventory/khata/:id/image — blob for preview (auth header). */
export async function fetchKhataImageBlob(uploadId) {
  const res = await api.get(`/inventory/khata/${uploadId}/image`, { responseType: 'blob' })
  return res.data
}
