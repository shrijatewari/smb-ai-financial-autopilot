import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Landmark,
  Receipt,
  Users,
  MessageCircle,
  Tag,
  Calendar,
  Radar,
  FlaskConical,
  GitBranch,
  Radio,
  Smartphone,
  Building2,
  Bell,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { fetchCollectionCustomers, fetchLedgerTransactions, fetchRlDebug } from '../services/api'
import { fetchExpenseCategoryMom } from '../lib/expenseCategoryMom'
import { getNextSeasonalRetailEvent } from '../lib/seasonalRetailCalendar'
import {
  MOCK_ANOMALY_FLAGS,
  MOCK_AA_STATUS,
  MOCK_EXPENSE_CATEGORY_TREND,
  MOCK_LATE_PAYMENT_SCORES,
  MOCK_PWA_INFO,
  MOCK_RAZORPAY_WEBHOOK_EVENT,
  MOCK_RL_OUTCOMES,
  MOCK_WA_INTENTS,
  MOCK_BUSINESSES,
  mockScenarioResult,
} from '../lib/platformMocks'
import { formatInr } from '../lib/collections'

/** Twin snapshot alerts: strings (fraud/spike) + suspicious_txn objects from the pipeline. */
function normalizeTwinAlerts(alerts) {
  if (!Array.isArray(alerts)) return []
  return alerts.map((a, i) => {
    if (typeof a === 'string') {
      return { key: `str-${i}`, kind: 'text', text: a }
    }
    if (a && typeof a === 'object' && a.type === 'suspicious_txn') {
      return {
        key: `txn-${i}`,
        kind: 'suspicious',
        date: a.date,
        amount: a.amount,
        z: a.z_score,
      }
    }
    return { key: `o-${i}`, kind: 'text', text: JSON.stringify(a) }
  })
}

function StatusBadge({ kind }) {
  const map = {
    live: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    partial: 'bg-amber-100 text-amber-950 border-amber-200',
    mock: 'bg-violet-100 text-violet-900 border-violet-200',
    planned: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  const label = { live: 'Live', partial: 'Partial', mock: 'Mock UI', planned: 'Planned' }[kind] || kind
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[kind] || map.mock}`}>
      {label}
    </span>
  )
}

export default function PlatformCapabilities() {
  const { streamStatus, snapshot } = useSystemSnapshot()
  const [delayDays, setDelayDays] = useState(0)
  const [hire, setHire] = useState(0)
  const [rlDebug, setRlDebug] = useState(null)
  const [customersPayload, setCustomersPayload] = useState(null)
  const [expenseInsight, setExpenseInsight] = useState(null)
  const [expenseLoading, setExpenseLoading] = useState(true)
  const seasonalHint = useMemo(() => getNextSeasonalRetailEvent(), [])
  const scenario = useMemo(() => mockScenarioResult({ delayDaysExtra: delayDays, hireCostMonthly: hire }), [delayDays, hire])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchRlDebug().catch(() => null), fetchCollectionCustomers().catch(() => null)]).then(([rl, cust]) => {
      if (!cancelled) {
        setRlDebug(rl)
        setCustomersPayload(cust)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setExpenseLoading(true)
    fetchExpenseCategoryMom(fetchLedgerTransactions)
      .then((r) => {
        if (!cancelled) setExpenseInsight(r)
      })
      .catch(() => {
        if (!cancelled) setExpenseInsight(null)
      })
      .finally(() => {
        if (!cancelled) setExpenseLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const twinAlerts = useMemo(() => normalizeTwinAlerts(snapshot?.alerts), [snapshot?.alerts])
  const rlMeta = snapshot?.meta?.rl && typeof snapshot.meta.rl === 'object' ? snapshot.meta.rl : null

  const liveLateRows = useMemo(() => {
    const items = customersPayload?.items || []
    if (!items.length) return []
    return [...items]
      .filter((c) => c && (Number(c.total_due) > 0 || c.risk_score != null))
      .sort((a, b) => Number(b.risk_score ?? 0) - Number(a.risk_score ?? 0))
      .slice(0, 4)
      .map((c) => {
        const risk = Number(c.risk_score ?? 0.5)
        const reliabilityPct = Math.max(0, Math.min(100, Math.round((1 - risk) * 100)))
        return {
          name: c.name,
          note: `${formatInr(c.total_due)} due · risk ${(risk * 100).toFixed(0)}% (DB)`,
          payThisWeek: reliabilityPct / 100,
        }
      })
  }, [customersPayload])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <PageHeader
        title="Platform capabilities"
        subtitle="What is live vs illustrative. The twin runs fraud checks, z-scores, and RL ranking on each tick. This page also loads debit ledger rows to show month-over-month spend by category, and a client-side India retail calendar for the next seasonal cluster (Monte Carlo still uses ledger + simulation only)."
      />

      <Card className="mb-6 border border-sky-200/80 bg-sky-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-sky-950">Why it used to look “all mock”</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-sky-950/90">
          <p>
            This page originally showed <strong>static cards</strong> so demos worked offline. The backend already computes{' '}
            <strong>real anomaly-style alerts</strong> (fraud flags + statistical spikes + suspicious rows) and{' '}
            <strong>real RL metadata</strong> (<code className="rounded bg-white/80 px-1 text-xs">meta.rl</code> in the twin
            snapshot, plus Q-learning on the server). Below also pulls <strong>GET /transactions/ledger</strong> debits for category MoM and shows the next seasonal hint from a built-in retail calendar (not the MC engine).
          </p>
        </CardContent>
      </Card>

      <Card className="mb-8 border border-violet-200/80 bg-white/95">
        <CardHeader>
          <CardTitle className="text-base">Quick matrix</CardTitle>
          <p className="text-sm font-normal text-violet-950/70">
            SSE twin status here:{' '}
            <span className="font-semibold text-violet-900">
              {streamStatus === 'live' ? 'Live' : streamStatus === 'reconnecting' ? 'Reconnecting' : 'Starting'}
            </span>
            . Razorpay webhook, AA routes, GST summary, WhatsApp inbound, daily briefing scheduler, and RL hooks exist in
            the FastAPI app – see OpenAPI <code className="rounded bg-violet-100 px-1 text-xs">/docs</code>.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-violet-100 text-xs uppercase text-violet-600">
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Backend</th>
                <th className="py-2">Frontend</th>
              </tr>
            </thead>
            <tbody className="text-violet-950/90">
              {[
                ['Account Aggregator', 'live', 'Profile + this page (mock status)'],
                ['GST liability / summary', 'live', '/gst + Today card'],
                ['Razorpay webhook → ledger', 'live', 'Transactions source filter + mock event below'],
                ['SSE snapshot push', 'live', 'Top bar + Today'],
                ['Morning WhatsApp briefing', 'live', '/profile'],
                ['WhatsApp bot intents', 'live', 'Meta webhook – try intents below'],
                ['Late payment score', 'live', 'Customers DB + risk_score (below)'],
                ['Anomaly flags', 'live', 'Twin alerts + suspicious_txn from pipeline'],
                ['What-if scenario', 'mock', 'Slider below'],
                ['Seasonal / festival bias', 'live', 'Client retail calendar (twin MC separate)'],
                ['Expense category trend', 'live', 'Ledger debits MoM by category'],
                ['RL outcome tracking', 'live', 'meta.rl + GET /rl/debug + POST /rl/feedback'],
                ['PWA offline', 'planned', 'Mock install panel'],
                ['Multi-business / CA', 'planned', 'Mock grid'],
                ['Explain this (voice)', 'live', 'Today → Assistant'],
                ['Notification log (briefing)', 'live', 'Profile – mock rows if GET /notifications fails'],
              ].map(([cap, be, fe]) => (
                <tr key={cap} className="border-b border-violet-50">
                  <td className="py-2 pr-3 font-medium">{cap}</td>
                  <td className="py-2 pr-3 text-xs text-violet-700">{be}</td>
                  <td className="py-2 text-xs text-violet-700">{fe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full border-teal-200/60">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-teal-700" />
                <CardTitle className="text-base">Bank sync (AA)</CardTitle>
              </div>
              <StatusBadge kind="partial" />
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/80">
              <p>
                Routes: <code className="rounded bg-violet-100 px-1 text-xs">/aa/status</code>,{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">/aa/initiate</code>. Demo status:
              </p>
              <ul className="list-inside list-disc text-xs">
                <li>Consent: {MOCK_AA_STATUS.consentStatus}</li>
                <li>Accounts: {MOCK_AA_STATUS.accountsLinked} · Last fetch: {MOCK_AA_STATUS.lastFetchedAt}</li>
                <li>Txns (24h): {MOCK_AA_STATUS.txnsIngested24h}</li>
              </ul>
              <Link to="/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-[#6C3BFF] hover:underline">
                Open Profile (bank linking) <ExternalLink className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <Card className="h-full border-orange-200/60">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-orange-700" />
                <CardTitle className="text-base">GST intelligence</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="text-sm text-violet-950/80">
              <p>
                <code className="rounded bg-violet-100 px-1 text-xs">GET /gst/summary</code> powers the GST page and Today
                warnings when registered.
              </p>
              <Link to="/gst" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6C3BFF] hover:underline">
                Open GST page <ExternalLink className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Card className="h-full border-violet-200/80">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-700" />
                <CardTitle className="text-base">Late payment &amp; risk (customers)</CardTitle>
              </div>
              <StatusBadge kind={liveLateRows.length ? 'live' : 'mock'} />
            </CardHeader>
            <CardContent className="space-y-2">
              {(liveLateRows.length ? liveLateRows : MOCK_LATE_PAYMENT_SCORES).map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-violet-950">{r.name}</p>
                    <p className="text-[11px] text-violet-600">{r.note}</p>
                  </div>
                  <span className="tabular-nums font-bold text-emerald-800">{(100 * r.payThisWeek).toFixed(0)}%</span>
                </div>
              ))}
              <p className="text-[11px] text-violet-500">
                {liveLateRows.length
                  ? 'Live: sorted by risk_score from GET /collections/customers. % ≈ (1 − risk) × 100.'
                  : 'Demo rows – log in and seed customers, or use demo@example.com after seed_mock_data.py.'}
              </p>
              <Link to="/people" className="inline-flex text-xs font-semibold text-[#6C3BFF] hover:underline">
                See People / dues
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
          <Card className="h-full border-emerald-200/70">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-700" />
                <CardTitle className="text-base">WhatsApp</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-violet-950/80">Inbound intents (examples):</p>
              <ul className="space-y-1 text-xs text-violet-800">
                {MOCK_WA_INTENTS.map((x) => (
                  <li key={x.intent}>
                    <span className="font-semibold">{x.intent}</span> – “{x.example}”
                  </li>
                ))}
              </ul>
              <p className="text-xs text-violet-600">
                Morning briefing: APScheduler + Profile toggle – see{' '}
                <Link className="font-semibold text-[#6C3BFF] hover:underline" to="/profile#profile-briefing">
                  Profile → briefing
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-violet-600" />
                <CardTitle className="text-base">Expense categories (ledger MoM)</CardTitle>
              </div>
              <StatusBadge
                kind={
                  expenseLoading
                    ? 'partial'
                    : expenseInsight?.rows?.length
                      ? 'live'
                      : expenseInsight && expenseInsight.totalTxns === 0
                        ? 'partial'
                        : 'mock'
                }
              />
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-[11px] leading-relaxed text-violet-600">
                Debits from <code className="rounded bg-violet-100 px-1">GET /transactions/ledger</code>, grouped by{' '}
                <code className="rounded bg-violet-100 px-1">category</code> – previous calendar month vs current (local
                month boundaries).
              </p>
              {expenseLoading ? (
                <p className="text-sm text-violet-500">Loading ledger…</p>
              ) : expenseInsight?.rows?.length ? (
                <>
                  <p className="text-[10px] text-violet-500">
                    {expenseInsight.prevYm} → {expenseInsight.curYm} · {expenseInsight.totalTxns} debit row(s) loaded
                  </p>
                  {expenseInsight.rows.map((e) => (
                    <div key={e.category} className="flex flex-wrap items-center justify-between gap-1 text-sm">
                      <span className="min-w-0 capitalize text-violet-800">{e.category.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] tabular-nums text-violet-500">
                          {formatInr(e.prevTotal)} → {formatInr(e.curTotal)}
                        </span>
                        <Badge variant={e.deltaPct > 0 ? 'danger' : e.deltaPct < 0 ? 'success' : 'muted'}>
                          {e.deltaPct > 0 ? '+' : ''}
                          {e.deltaPct}% MoM
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              ) : expenseInsight && expenseInsight.totalTxns === 0 ? (
                <p className="text-sm text-violet-600">
                  No debit rows in the last two calendar months – seed{' '}
                  <code className="rounded bg-violet-100 px-1 text-xs">load_mock_csv_to_ledger.py</code> or add
                  transactions.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-amber-800">Could not load ledger – demo bars:</p>
                  {MOCK_EXPENSE_CATEGORY_TREND.map((e) => (
                    <div key={e.category} className="flex items-center justify-between text-sm opacity-90">
                      <span className="capitalize text-violet-800">{e.category.replace('_', ' ')}</span>
                      <Badge variant={e.deltaPct > 0 ? 'danger' : e.deltaPct < 0 ? 'success' : 'muted'}>
                        {e.deltaPct > 0 ? '+' : ''}
                        {e.deltaPct}% MoM
                      </Badge>
                    </div>
                  ))}
                </>
              )}
              <Link to="/transactions" className="inline-flex text-xs font-semibold text-[#6C3BFF] hover:underline">
                Transactions →
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-700" />
                <CardTitle className="text-base">Seasonal context</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="text-sm text-violet-950/85">
              <p className="text-[11px] leading-relaxed text-violet-600">
                Next cluster from the in-app <strong>India retail calendar</strong> (approx. Gregorian dates). The cash
                twin still forecasts from ledger + Monte Carlo – this block is for merchandising / staffing only.
              </p>
              <p className="mt-3 font-medium text-violet-950">{seasonalHint.nextEvent}</p>
              <p className="mt-1 text-xs text-violet-700">
                {seasonalHint.daysAway === 0 ? 'Today / underway' : `In ~${seasonalHint.daysAway} day(s)`} ·{' '}
                <span className="font-mono text-[10px]">{seasonalHint.eventDate}</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-violet-600">{seasonalHint.hint}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card className="border-rose-200/60">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-rose-700" />
                <CardTitle className="text-base">Anomaly &amp; risk hints</CardTitle>
              </div>
              <StatusBadge kind={twinAlerts.length ? 'live' : 'partial'} />
            </CardHeader>
            <CardContent className="space-y-2">
              {twinAlerts.length > 0 ? (
                twinAlerts.map((a) =>
                  a.kind === 'suspicious' ? (
                    <div key={a.key} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs">
                      <p className="font-semibold text-rose-950">
                        {formatInr(a.amount)} · {a.date}
                        {a.z != null && a.z !== '' ? ` · z=${Number(a.z).toFixed(2)}` : ''}
                      </p>
                      <p className="mt-1 text-rose-900/90">Suspicious vs recent pattern (pipeline)</p>
                      <Badge variant="warning" className="mt-1 capitalize">
                        review
                      </Badge>
                    </div>
                  ) : (
                    <div key={a.key} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
                      {a.text}
                    </div>
                  )
                )
              ) : (
                <>
                  <p className="text-[11px] text-violet-600">
                    No fraud/spike/suspicious rows in the <strong>latest twin snapshot</strong> – ingest more ledger data or wait for the next engine tick. Static examples:
                  </p>
                  {MOCK_ANOMALY_FLAGS.map((a) => (
                    <div key={a.id} className="rounded-lg border border-dashed border-rose-200/80 bg-white/60 px-3 py-2 text-xs opacity-90">
                      <p className="font-semibold text-rose-950">
                        {formatInr(a.amount)} · {a.date} <span className="text-[10px] font-normal text-rose-600">(demo)</span>
                      </p>
                      <p className="mt-1 text-rose-900/90">{a.reason}</p>
                      <Badge variant="warning" className="mt-1 capitalize">
                        {a.severity}
                      </Badge>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-indigo-700" />
                <CardTitle className="text-base">What-if (mock runway)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <label className="block text-xs text-violet-700">
                Extra days you give debtors: {delayDays}
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="mt-1 w-full accent-[#6C3BFF]"
                />
              </label>
              <label className="block text-xs text-violet-700">
                New hire monthly cost (₹): {hire.toLocaleString('en-IN')}
                <input
                  type="range"
                  min={0}
                  max={80000}
                  step={2000}
                  value={hire}
                  onChange={(e) => setHire(Number(e.target.value))}
                  className="mt-1 w-full accent-[#6C3BFF]"
                />
              </label>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                <p className="text-lg font-bold tabular-nums text-indigo-950">~{scenario.runwayDays} days runway</p>
                <p className="mt-1 text-xs text-indigo-900/85">{scenario.narrative}</p>
              </div>
              <Link to="/cash-flow" className="text-xs font-semibold text-[#6C3BFF] hover:underline">
                Full cash flow →
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-violet-700" />
                <CardTitle className="text-base">RL policy (tabular Q)</CardTitle>
              </div>
              <StatusBadge kind={rlMeta || rlDebug ? 'live' : 'partial'} />
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {rlMeta ? (
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2 font-mono text-[11px] text-violet-900">
                  <p>
                    <span className="text-violet-600">state_key</span> {String(rlMeta.state_key ?? '–')}
                  </p>
                  <p className="mt-1">
                    <span className="text-violet-600">selected_action</span> {String(rlMeta.selected_action ?? '–')}
                  </p>
                  <p className="mt-1">
                    <span className="text-violet-600">ε</span> {String(rlMeta.epsilon ?? '–')}{' '}
                    <span className="text-violet-600">mode</span> {String(rlMeta.mode ?? '–')}
                  </p>
                  {rlMeta.q_values && (
                    <p className="mt-1 break-all text-[10px]">
                      <span className="text-violet-600">q_values</span> {JSON.stringify(rlMeta.q_values)}
                    </p>
                  )}
                  <p className="mt-2 font-sans text-[10px] text-violet-600">
                    From <code className="rounded bg-white/80 px-1">snapshot.meta.rl</code> (each pipeline tick).
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-violet-600">Connect to the API and wait for a system snapshot – RL meta appears after the engine runs.</p>
              )}
              {rlDebug?.last_transition && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2 font-mono text-[10px] text-emerald-950">
                  <p className="text-emerald-800">GET /rl/debug</p>
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{JSON.stringify(rlDebug.last_transition, null, 2)}</pre>
                </div>
              )}
              <p className="font-sans text-[11px] text-violet-600">
                Feedback loop: <code className="rounded bg-violet-100 px-1">POST /rl/feedback</code>,{' '}
                <code className="rounded bg-violet-100 px-1">POST /user/interaction</code> – Q-table persisted in{' '}
                <code className="rounded bg-violet-100 px-1">data/rl_qtable.json</code> on the server.
              </p>
              <p className="font-medium text-violet-800">Illustrative “outcomes” (not stored events):</p>
              {MOCK_RL_OUTCOMES.map((r, i) => (
                <div key={i} className="flex justify-between gap-2 border-b border-violet-50 pb-2 last:border-0 opacity-80">
                  <span>
                    {r.action} · {r.customer}
                  </span>
                  <span className={r.paidWithin7d ? 'text-emerald-700' : 'text-rose-700'}>
                    {r.paidWithin7d ? 'Paid ≤7d' : 'No'} · r={r.reward}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}>
          <Card className="border-emerald-200/70">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-emerald-700" />
                <CardTitle className="text-base">Live twin (SSE)</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="text-sm text-violet-950/80">
              <code className="rounded bg-violet-100 px-1 text-xs">GET /system/stream</code> pushes JSON snapshots ~3s.
              Status: <strong>{streamStatus}</strong>.
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-700" />
                <CardTitle className="text-base">Razorpay webhook (live)</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="font-mono text-[11px] text-violet-900">
              <p>Last mock receipt:</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-violet-50 p-2">
                {JSON.stringify(MOCK_RAZORPAY_WEBHOOK_EVENT, null, 2)}
              </p>
              <p className="mt-2 font-sans text-xs text-violet-600">
                Real endpoint: <code className="rounded bg-violet-100 px-1">POST /webhooks/razorpay</code>
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-slate-700" />
                <CardTitle className="text-base">PWA / offline (planned)</CardTitle>
              </div>
              <StatusBadge kind="planned" />
            </CardHeader>
            <CardContent className="text-sm text-violet-950/80">
              <p className="text-xs">Mock installability: {String(MOCK_PWA_INFO.installable)}</p>
              <p className="mt-1 text-xs">Cached routes: {MOCK_PWA_INFO.cachedRoutes.join(', ')}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled title="Service worker not registered yet">
                Simulate install
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-violet-700" />
                <CardTitle className="text-base">Multi-business (mock)</CardTitle>
              </div>
              <StatusBadge kind="planned" />
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_BUSINESSES.map((b) => (
                <div key={b.id} className="flex justify-between rounded-lg border border-violet-100 px-3 py-2 text-sm">
                  <span>{b.name}</span>
                  <span className="tabular-nums text-violet-700">{(100 * b.risk).toFixed(0)}% risk</span>
                </div>
              ))}
              <p className="text-xs text-violet-500">Switcher UI planned – data model TBD.</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.39 }} className="md:col-span-2">
          <Card className="border-violet-200/80 bg-gradient-to-br from-white to-violet-50/30">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-violet-700" />
                <CardTitle className="text-base">Explain this + assistant</CardTitle>
              </div>
              <StatusBadge kind="live" />
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm text-violet-950/85">
              <p>
                From <strong>Today</strong>, use <strong>Explain this</strong> to open the assistant with a plain-Hindi
                friendly prompt about risk.
              </p>
              <Link to="/assistant?explain=risk">
                <Button type="button" variant="secondary" size="sm">
                  Open assistant (explain risk)
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
