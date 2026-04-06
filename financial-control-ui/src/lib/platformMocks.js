/**
 * Mock data for Platform / capabilities UI when live APIs are unavailable or for demos.
 * Does not replace production APIs – see /platform for status labels (Live vs Mock).
 */

/** Late payment probability (demo model output) – merged on People when engine has no field. */
export const MOCK_LATE_PAYMENT_SCORES = [
  { name: 'Ramesh Suppliers', payThisWeek: 0.78, note: 'Regular payer, small balance' },
  { name: 'Sharma Traders', payThisWeek: 0.42, note: 'Often stretches to 45d' },
  { name: 'Priya Foods', payThisWeek: 0.91, note: 'UPI same week' },
]

/** Unsupervised-style anomaly flags on ledger (mock). */
export const MOCK_ANOMALY_FLAGS = [
  {
    id: 'a1',
    date: '2026-03-28',
    amount: 45000,
    reason: 'Large cash-style debit on Sunday vs your 90d pattern',
    severity: 'review',
  },
  {
    id: 'a2',
    date: '2026-03-25',
    amount: 1200,
    reason: 'Duplicate UPI narration within 2h',
    severity: 'low',
  },
]

/** What-if scenario (mock delta on runway days). */
export function mockScenarioResult({ delayDaysExtra = 0, hireCostMonthly = 0 }) {
  const baseRunway = 18
  let delta = 0
  if (delayDaysExtra > 0) delta += Math.min(12, delayDaysExtra * 0.4)
  if (hireCostMonthly > 0) delta -= Math.min(15, hireCostMonthly / 8000)
  return {
    runwayDays: Math.max(3, Math.round(baseRunway + delta)),
    narrative:
      hireCostMonthly > 0
        ? `Hiring at ₹${hireCostMonthly.toLocaleString('en-IN')}/mo trims runway vs base case.`
        : delayDaysExtra > 0
          ? `Giving ${delayDaysExtra} extra days to debtors slightly improves your buffer in this mock.`
          : 'Baseline mock runway ~18 days.',
  }
}

/** Festival / season proximity for forecast (mock feature flag). */
export const MOCK_SEASONAL_CONTEXT = {
  nextEvent: 'Eid / long weekend cluster',
  daysAway: 22,
  hint: 'Retail uplift + possible supplier prepayments – model bias +4% inflow variance (mock).',
}

/** Expense category trend vs last month (mock). */
export const MOCK_EXPENSE_CATEGORY_TREND = [
  { category: 'raw_material', deltaPct: 23, direction: 'up' },
  { category: 'transport', deltaPct: -5, direction: 'down' },
  { category: 'rent', deltaPct: 0, direction: 'flat' },
]

/** Last Razorpay webhook event (mock ledger closure). */
export const MOCK_RAZORPAY_WEBHOOK_EVENT = {
  event: 'payment.captured',
  amountInr: 2400,
  at: '2026-03-30T04:12:00+05:30',
  ledgerPosted: true,
  customerNote: 'customer_id=12',
}

/** AA sync status (mock when Setu/Finvu not configured). */
export const MOCK_AA_STATUS = {
  consentStatus: 'ACTIVE',
  fiu: 'demo_fiu',
  lastFetchedAt: '2026-03-29T18:00:00+05:30',
  accountsLinked: 2,
  txnsIngested24h: 14,
}

/** RL outcome tracking (mock closed loop). */
export const MOCK_RL_OUTCOMES = [
  { action: 'whatsapp_reminder', customer: 'Ramesh', paidWithin7d: true, reward: 1.0 },
  { action: 'call', customer: 'Sharma', paidWithin7d: false, reward: -0.2 },
]

/** PWA / offline (mock). */
export const MOCK_PWA_INFO = {
  installable: true,
  cachedRoutes: ['/', '/people', '/assistant'],
  lastSyncedAt: new Date().toISOString(),
}

/** Multi-business / CA view (mock). */
export const MOCK_BUSINESSES = [
  { id: 'b1', name: 'Kirana – Main Road', risk: 0.18 },
  { id: 'b2', name: 'Wholesale – Mandi', risk: 0.31 },
]

/**
 * GET /notifications shape when the API fails (network, 5xx, etc.) – Profile “Briefing & notification log”.
 * Matches backend list_notifications items: id, channel, kind, status, detail, created_at, mock.
 */
export function getMockNotificationsResponse() {
  const now = Date.now()
  const iso = (msAgo) => new Date(now - msAgo).toISOString()
  return {
    count: 3,
    _source: 'mock',
    _mockFallback: true,
    items: [
      {
        id: 'demo-notif-1',
        channel: 'whatsapp',
        kind: 'daily_briefing',
        status: 'mock',
        detail:
          'Demo: morning briefing payload – real rows appear after scheduler runs with Meta WhatsApp configured.',
        created_at: iso(3600000 * 5),
        mock: true,
      },
      {
        id: 'demo-notif-2',
        channel: 'whatsapp',
        kind: 'daily_briefing',
        status: 'failed',
        detail: 'Demo: example failed send (rate limit) – check server logs in production.',
        created_at: iso(86400000 * 1),
        mock: true,
      },
      {
        id: 'demo-notif-3',
        channel: 'whatsapp',
        kind: 'outbound_reminder',
        status: 'sent',
        detail: 'Demo: collection reminder template test (mock).',
        created_at: iso(86400000 * 3),
        mock: true,
      },
    ],
  }
}

/** GST fallback when GET /gst/summary and /compliance/gst both fail (demo UI). */
export const MOCK_GST_FALLBACK = {
  estimated_liability_inr: 42000,
  next_due_date: '2026-04-20',
  gstin: '29AAAAA0000A1Z5',
  basis: 'mock forecast – save GSTIN on profile for GET /gst/summary',
  note: 'Demo numbers. Connect GSTIN on onboarding and API keys for live alignment.',
  _source: 'mock',
}

/** WhatsApp bot intents supported (mirrors backend router where applicable). */
export const MOCK_WA_INTENTS = [
  { intent: 'balance / aaj kitna', example: 'Aaj kitna aaya?' },
  { intent: 'today / risk', example: 'Aaj kya karna hai?' },
  { intent: 'reminder', example: 'Ramesh ko yaad dilao' },
  { intent: 'help', example: 'HELP' },
]

/**
 * Attach mock pay-this-week score to collection queue rows by index (deterministic demo).
 */
export function attachMockPayScores(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  return rows.map((row, i) => {
    const m = MOCK_LATE_PAYMENT_SCORES[i % MOCK_LATE_PAYMENT_SCORES.length]
    return {
      ...row,
      payThisWeek: row.payThisWeek ?? m.payThisWeek,
      payScoreNote: row.payScoreNote ?? m.note,
    }
  })
}
