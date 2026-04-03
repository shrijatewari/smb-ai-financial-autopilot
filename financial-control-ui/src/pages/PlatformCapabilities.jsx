import { useMemo, useState } from 'react'
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
import {
  MOCK_ANOMALY_FLAGS,
  MOCK_AA_STATUS,
  MOCK_EXPENSE_CATEGORY_TREND,
  MOCK_LATE_PAYMENT_SCORES,
  MOCK_PWA_INFO,
  MOCK_RAZORPAY_WEBHOOK_EVENT,
  MOCK_RL_OUTCOMES,
  MOCK_SEASONAL_CONTEXT,
  MOCK_WA_INTENTS,
  MOCK_BUSINESSES,
  mockScenarioResult,
} from '../lib/platformMocks'
import { formatInr } from '../lib/collections'

function StatusBadge({ kind }) {
  const map = {
    live: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    partial: 'bg-amber-100 text-amber-950 border-amber-200',
    mock: 'bg-violet-100 text-violet-900 border-violet-200',
    planned: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  const label = { live: 'Live backend', partial: 'Partial', mock: 'Mock UI', planned: 'Planned' }[kind] || kind
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[kind] || map.mock}`}>
      {label}
    </span>
  )
}

export default function PlatformCapabilities() {
  const { streamStatus } = useSystemSnapshot()
  const [delayDays, setDelayDays] = useState(0)
  const [hire, setHire] = useState(0)
  const scenario = useMemo(() => mockScenarioResult({ delayDaysExtra: delayDays, hireCostMonthly: hire }), [delayDays, hire])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <PageHeader
        title="Platform capabilities"
        subtitle="What the product covers today (backend + UI), what is mocked for demos, and quick links. Many items from the roadmap are already implemented server-side — this page surfaces them in one place."
      />

      <Card className="mb-8 border border-violet-200/80 bg-white/95">
        <CardHeader>
          <CardTitle className="text-base">Quick matrix</CardTitle>
          <p className="text-sm font-normal text-violet-950/70">
            SSE twin status here:{' '}
            <span className="font-semibold text-violet-900">
              {streamStatus === 'live' ? 'Live' : streamStatus === 'reconnecting' ? 'Reconnecting' : 'Starting'}
            </span>
            . Razorpay webhook, AA routes, GST summary, WhatsApp inbound, daily briefing scheduler, and RL hooks exist in
            the FastAPI app — see OpenAPI <code className="rounded bg-violet-100 px-1 text-xs">/docs</code>.
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
                ['WhatsApp bot intents', 'live', 'Meta webhook — try intents below'],
                ['Late payment score', 'partial', 'People + mock %'],
                ['Anomaly flags', 'mock', 'This page'],
                ['What-if scenario', 'mock', 'Slider below'],
                ['Seasonal / festival bias', 'mock', 'Copy block'],
                ['Expense category trend', 'mock', 'Bars below'],
                ['RL outcome tracking', 'partial', 'Mock table + POST /rl/feedback'],
                ['PWA offline', 'planned', 'Mock install panel'],
                ['Multi-business / CA', 'planned', 'Mock grid'],
                ['Explain this (voice)', 'live', 'Today → Assistant'],
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
                <CardTitle className="text-base">Late payment score (demo)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_LATE_PAYMENT_SCORES.map((r) => (
                <div key={r.name} className="flex items-center justify-between rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-violet-950">{r.name}</p>
                    <p className="text-[11px] text-violet-600">{r.note}</p>
                  </div>
                  <span className="tabular-nums font-bold text-emerald-800">{(100 * r.payThisWeek).toFixed(0)}%</span>
                </div>
              ))}
              <Link to="/people" className="inline-flex text-xs font-semibold text-[#6C3BFF] hover:underline">
                See People / dues (scores merged when queue loads)
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
                    <span className="font-semibold">{x.intent}</span> — “{x.example}”
                  </li>
                ))}
              </ul>
              <p className="text-xs text-violet-600">
                Morning briefing: APScheduler + Profile toggle — see{' '}
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
                <CardTitle className="text-base">Expense categories (mock trend)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_EXPENSE_CATEGORY_TREND.map((e) => (
                <div key={e.category} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-violet-800">{e.category.replace('_', ' ')}</span>
                  <Badge variant={e.deltaPct > 0 ? 'danger' : e.deltaPct < 0 ? 'success' : 'muted'}>
                    {e.deltaPct > 0 ? '+' : ''}
                    {e.deltaPct}% MoM
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-700" />
                <CardTitle className="text-base">Seasonal context (mock)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="text-sm text-violet-950/85">
              <p className="font-medium">{MOCK_SEASONAL_CONTEXT.nextEvent}</p>
              <p className="mt-1 text-xs text-violet-700">In ~{MOCK_SEASONAL_CONTEXT.daysAway} days</p>
              <p className="mt-2 text-xs leading-relaxed text-violet-600">{MOCK_SEASONAL_CONTEXT.hint}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card className="border-rose-200/60">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-rose-700" />
                <CardTitle className="text-base">Anomaly hints (mock)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_ANOMALY_FLAGS.map((a) => (
                <div key={a.id} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs">
                  <p className="font-semibold text-rose-950">
                    {formatInr(a.amount)} · {a.date}
                  </p>
                  <p className="mt-1 text-rose-900/90">{a.reason}</p>
                  <Badge variant="warning" className="mt-1 capitalize">
                    {a.severity}
                  </Badge>
                </div>
              ))}
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
                <CardTitle className="text-base">RL outcomes (mock)</CardTitle>
              </div>
              <StatusBadge kind="mock" />
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {MOCK_RL_OUTCOMES.map((r, i) => (
                <div key={i} className="flex justify-between gap-2 border-b border-violet-50 pb-2 last:border-0">
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
              <p className="text-xs text-violet-500">Switcher UI planned — data model TBD.</p>
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
