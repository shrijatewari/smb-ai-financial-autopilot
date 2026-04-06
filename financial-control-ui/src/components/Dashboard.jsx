import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronRight,
  IndianRupee,
  Link2,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from './ui/card'
import { useAuth } from '../context/AuthContext'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { useTr } from '../hooks/useTr'
import {
  connectPaytm,
  executeAction,
  fetchGstCompliance,
  fetchPaytmTransactions,
  getApiErrorMessage,
  getOnboardingState,
  postPaymentLink,
  postSmsIngest,
  postUserInteraction,
} from '../services/api'
import {
  buildWhatsappCollectionMessage,
  firstNameFromCustomer,
  formatInr,
  mockLineItemsForCustomer,
  normalizePhone10,
  openTelDialer,
  openUserGestureBlankTab,
  navigateTabOrOpenWhatsApp,
} from '../lib/collections'

function formatAlertLine(a, formatInrFn) {
  if (typeof a === 'string') return a
  if (a && typeof a === 'object' && a.type === 'suspicious_txn') {
    const z =
      a.z_score != null && typeof a.z_score === 'number' ? a.z_score.toFixed(2) : '–'
    return `${a.date || '–'} · ${formatInrFn(a.amount)} · z=${z}`
  }
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function formatPct(p) {
  if (p == null || Number.isNaN(p)) return '–'
  return `${(100 * p).toFixed(1)}%`
}

function buildCallScript(customer, amount) {
  const first = firstNameFromCustomer(customer)
  const items = mockLineItemsForCustomer(customer)
  const rs = Math.round(Number(amount) || 0)
  return `Hi ${first}, I'm calling about ₹${rs} still due for ${items}. When can you settle this?`
}

export default function Dashboard() {
  const t = useTr()
  const { user, logout } = useAuth()
  const { snapshot: snap, error: streamError, refreshSnapshot } = useSystemSnapshot()
  const [gst, setGst] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [paytmBusy, setPaytmBusy] = useState(false)
  const [paytmPreview, setPaytmPreview] = useState(null)
  const [paytmConnected, setPaytmConnected] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [rzpBusy, setRzpBusy] = useState(false)
  const [rzpResult, setRzpResult] = useState(null)
  const [collectPhone, setCollectPhone] = useState('9004930401')
  const [smsText, setSmsText] = useState('')
  const [smsBusy, setSmsBusy] = useState(false)
  const [smsToast, setSmsToast] = useState(null)
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoTrail, setAutoTrail] = useState(null)
  const [waTone, setWaTone] = useState('formal')
  const [waBusy, setWaBusy] = useState(false)
  const [callModal, setCallModal] = useState(null)
  const [kpiModal, setKpiModal] = useState(null)

  const loadAux = useCallback(async () => {
    try {
      const [gstData, ob] = await Promise.all([
        fetchGstCompliance(),
        getOnboardingState().catch(() => ({})),
      ])
      setGst(gstData)
      setNeedsOnboarding(!ob || Object.keys(ob).length === 0)
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadAux()
  }, [loadAux])

  useEffect(() => {
    if (streamError) setError(streamError)
    else setError(null)
  }, [streamError])

  useEffect(() => {
    if (!kpiModal) return
    const onKey = (e) => {
      if (e.key === 'Escape') setKpiModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kpiModal])

  const loading = snap == null && !error
  const risk = snap?.risk ?? 0
  const confidence = snap?.confidence ?? snap?.reconstruction?.confidence ?? 0
  const cashFlowSeries = snap?.forecast ?? []
  const primaryAction = snap?.action ?? null
  const dailyControl = snap?.daily_control ?? null
  const collectionQueue = dailyControl?.collection_queue ?? []
  const outcomes = dailyControl?.action_outcomes ?? null
  const daysToNeg = dailyControl?.days_to_negative
  const runwaySummary = dailyControl?.runway_summary ?? ''
  const modules = useMemo(() => {
    const raw = snap?.modules ?? []
    return [...raw].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }, [snap?.modules])
  const profileType = snap?.profile_type ?? ''
  const engineMeta = snap?.meta ?? {}

  const riskUrgent = risk > 0.25 || (daysToNeg != null && daysToNeg <= 7)

  async function handleRazorpayLink() {
    const meta = primaryAction?.metadata || {}
    const amt = Number(meta.suggested_amount ?? collectionQueue[0]?.amount ?? 2000)
    const name = String(meta.customer || collectionQueue[0]?.name || 'Customer')
    setRzpBusy(true)
    setRzpResult(null)
    try {
      const res = await postPaymentLink({
        amount: amt,
        customer_name: name,
        phone: collectPhone.replace(/\D/g, '').slice(-10) || '9004930401',
      })
      setRzpResult(res)
    } catch (e) {
      setRzpResult({
        error: getApiErrorMessage(e),
      })
    } finally {
      setRzpBusy(false)
    }
  }

  async function handleConnectPaytm() {
    setPaytmBusy(true)
    setPaytmPreview(null)
    try {
      await connectPaytm()
      setPaytmConnected(true)
      const tx = await fetchPaytmTransactions()
      setPaytmPreview(tx)
      await refreshSnapshot()
    } catch (e) {
      setToast({
        type: 'error',
        text: getApiErrorMessage(e),
      })
      setTimeout(() => setToast(null), 6000)
    } finally {
      setPaytmBusy(false)
    }
  }

  async function handleSmsIngest() {
    const t = (smsText || '').trim()
    if (!t) return
    setSmsBusy(true)
    setSmsToast(null)
    try {
      const res = await postSmsIngest(t)
      const n = res?.rows_appended ?? res?.parsed?.length ?? 0
      setSmsToast({ type: 'success', text: `Added ${n} row(s) from SMS text.` })
      setSmsText('')
      await refreshSnapshot()
    } catch (e) {
      setSmsToast({
        type: 'error',
        text: getApiErrorMessage(e),
      })
    } finally {
      setSmsBusy(false)
      setTimeout(() => setSmsToast(null), 8000)
    }
  }

  async function handleAutoHandle() {
    if (!primaryAction && collectionQueue.length === 0) return
    setAutoBusy(true)
    setAutoTrail(null)
    setToast(null)
    try {
      const meta = primaryAction?.metadata || {}
      const amt = Number(meta.suggested_amount ?? collectionQueue[0]?.amount ?? 2400)
      const name = String(meta.customer || collectionQueue[0]?.name || 'Customer')
      const payRes = await postPaymentLink({
        amount: amt,
        customer_name: name,
        phone: collectPhone.replace(/\D/g, '').slice(-10) || '9004930401',
      })
      const act = primaryAction?.action || 'collect_payment'
      const execPayload = { action: act, reference: `auto-${Date.now()}` }
      if (act === 'collect_payment') {
        execPayload.amount = amt
        execPayload.customer = name
      }
      const execRes = await executeAction(execPayload)
      setAutoTrail({
        payment_link: payRes.payment_link,
        mock: payRes.mock,
        message: execRes.message,
        steps: [
          'Payment request generated',
          'Reminder window scheduled (demo)',
          'Execution logged for tracking',
        ],
      })
      setToast({
        type: 'success',
        text: 'System is handling it: payment link + follow-up (demo).',
        link: payRes.payment_link || execRes.payment_link || null,
      })
    } catch (e) {
      setToast({
        type: 'error',
        text: getApiErrorMessage(e),
      })
    } finally {
      setAutoBusy(false)
      setTimeout(() => setToast(null), 14000)
    }
  }

  async function sendWhatsappReminder(customer, amount) {
    const phone = normalizePhone10(collectPhone) || '9004930401'
    if (phone.length < 10) {
      setToast({ type: 'error', text: 'Enter a valid 10-digit phone number above.' })
      setTimeout(() => setToast(null), 6000)
      return
    }
    const waTab = openUserGestureBlankTab()
    setWaBusy(true)
    setToast(null)
    try {
      const res = await postPaymentLink({
        amount: Number(amount),
        customer_name: customer,
        phone: phone.replace(/\D/g, '').slice(-10) || '9004930401',
      })
      const msg = buildWhatsappCollectionMessage(customer, amount, waTone, res.payment_link)
      navigateTabOrOpenWhatsApp(waTab, phone, msg)
      setToast({
        type: 'success',
        text: `Opened WhatsApp draft for ${firstNameFromCustomer(customer)} – khaata message + Razorpay link.`,
        link: res.payment_link || undefined,
      })
    } catch (e) {
      const msg = buildWhatsappCollectionMessage(customer, amount, waTone)
      navigateTabOrOpenWhatsApp(waTab, phone, msg)
      setToast({
        type: 'success',
        text: `Opened WhatsApp draft (demo link in text). ${getApiErrorMessage(e)}`,
      })
    } finally {
      setWaBusy(false)
      setTimeout(() => setToast(null), 14000)
    }
  }

  async function copyRowPaymentLink(name, amount) {
    const phone = normalizePhone10(collectPhone) || '9004930401'
    if (phone.length < 10) {
      setToast({ type: 'error', text: 'Enter a valid 10-digit phone number above.' })
      setTimeout(() => setToast(null), 6000)
      return
    }
    setRzpBusy(true)
    try {
      const res = await postPaymentLink({
        amount: Number(amount),
        customer_name: name,
        phone: phone.replace(/\D/g, '').slice(-10) || '9004930401',
      })
      const url = res.payment_link
      if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
      setRzpResult(res)
      setToast({
        type: 'success',
        text: url ? 'Payment link copied – share or paste in WhatsApp.' : 'Payment link created.',
        link: url || undefined,
      })
    } catch (err) {
      setToast({ type: 'error', text: getApiErrorMessage(err) })
    } finally {
      setRzpBusy(false)
      setTimeout(() => setToast(null), 12000)
    }
  }

  function openCallModal(customer, amount) {
    const phone = normalizePhone10(collectPhone) || ''
    if (phone.length < 10) {
      setToast({ type: 'error', text: 'Enter a valid 10-digit phone number above.' })
      setTimeout(() => setToast(null), 6000)
      return
    }
    const script = buildCallScript(customer, amount)
    openTelDialer(phone)
    setCallModal({
      phase: 'done',
      customer,
      amount,
      phone,
      script,
      likelihood: 'medium',
      status: 'mock',
    })
  }

  const collectMeta = primaryAction?.metadata || {}
  const collectAmount = Number(collectMeta.suggested_amount ?? outcomes?.if_collect?.amount_inr ?? 2400)
  const collectName = String(collectMeta.customer || collectionQueue[0]?.name || 'Customer')
  const riskAfterCollect = outcomes?.if_collect?.risk_after

  return (
    <div className="twin-dashboard w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-28">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-br from-[#6C3BFF] via-violet-600 to-violet-500 p-8 text-white shadow-[0_20px_60px_-20px_rgba(108,59,255,0.55)]"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{t('AI बिज़नेस ट्विन', 'AI Business Twin')}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              {t('आपका बिज़नेस ट्विन सक्रिय है', 'Your Business Twin is Active')}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              {t(
                'नियंत्रण तल से लाइव संकेत – नकद, जोखिम और वसूली एक ही जगह।',
                'Live signals from your control plane – cash, risk, and collections in one place.'
              )}
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Sparkles className="h-9 w-9" />
          </div>
        </div>
      </motion.section>

      <div className="mb-10 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {[
          { id: 'cash', label: t('नकद', 'Cash'), value: formatInr(snap?.cash), sub: t('लाइव', 'Live'), icon: Wallet },
          {
            id: 'revenue',
            label: t('राजस्व नाड़ी', 'Revenue pulse'),
            value: formatInr(snap?.cash != null ? snap.cash * 0.08 : null),
            sub: t('प्रॉक्सी', 'Proxy'),
            icon: TrendingUp,
          },
          { id: 'risk', label: t('जोखिम', 'Risk'), value: formatPct(risk), sub: t('क्षितिज', 'Horizon'), icon: AlertTriangle },
          {
            id: 'receivables',
            label: t('प्राप्य', 'Receivables'),
            value: formatInr(collectionQueue.reduce((s, r) => s + (r.amount || 0), 0)),
            sub: t('क़तार', 'Queue'),
            icon: IndianRupee,
          },
        ].map((k, i) => (
          <motion.div
            key={k.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="min-w-0"
          >
            <Card className="border-emerald-400/25 shadow-[0_0_40px_-16px_rgba(52,211,153,0.3)] transition-shadow hover:shadow-[0_0_48px_-12px_rgba(52,211,153,0.45)]">
              <button
                type="button"
                onClick={() => setKpiModal(k.id)}
                className="w-full min-h-[88px] touch-manipulation rounded-xl p-0 text-left outline-none transition-colors hover:bg-violet-50/40 active:bg-violet-50/70 focus-visible:ring-2 focus-visible:ring-[#6C3BFF]/40 focus-visible:ring-offset-2"
                aria-label={`${k.label}: open how this number is calculated`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <k.icon className="h-5 w-5 shrink-0 text-[#6C3BFF]" aria-hidden />
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-violet-600">{k.sub}</span>
                      <ChevronRight className="h-4 w-4 text-violet-400" aria-hidden />
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-violet-950/60">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-violet-950">
                    {loading && !snap ? '–' : k.value}
                  </p>
                  <p className="mt-2 text-[11px] text-violet-600/80">
                    {t('स्रोत और बदलाव के लिए टैप करें', 'Tap for source & how to change')}
                  </p>
                </CardContent>
              </button>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mb-10 grid gap-4 md:grid-cols-3">
        {[
          {
            t: t('नकद की कमी का जोखिम', 'Cash shortage risk'),
            d:
              daysToNeg != null
                ? t(
                    `सिमुलेशन में ~${daysToNeg} दिन में तनाव`,
                    `Stress timing ~${daysToNeg} day${daysToNeg === 1 ? '' : 's'} in simulation`,
                  )
                : t('अधिकतर रास्ते सकारात्मक – फिर भी बकाया वसूलें', 'Majority paths positive – still chase dues'),
            i: '⚠️',
          },
          {
            t: t('मांग संकेत', 'Demand signal'),
            d: t('मॉड्यूल मिक्स आपके बिज़नेस प्रोफ़ाइल से अनुकूलित होता है', 'Module mix adapts from your business profile'),
            i: '📈',
          },
          {
            t: t('वसूली योग्य', 'Collectible'),
            d:
              collectionQueue.length > 0
                ? collectionQueue
                    .slice(0, 4)
                    .map((r) => `${formatInr(r.amount)} – ${r.name}`)
                    .join(' · ')
                : t('क़तार प्राप्य एक्सपोज़र से भरती है', 'Queue fills from receivable exposure'),
            i: '💰',
          },
        ].map((x, i) => (
          <motion.div
            key={['insight-cash-risk', 'insight-demand', 'insight-collect'][i]}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05 }}
            className="rounded-2xl border border-[#6C3BFF]/25 bg-white/85 p-4 shadow-[0_0_32px_-12px_rgba(108,59,255,0.35)] backdrop-blur"
          >
            <p className="text-base font-semibold text-violet-950">
              {x.i} {x.t}
            </p>
            <p className="mt-2 text-sm text-violet-950/65">{x.d}</p>
            <a
              href="#sms-ingest"
              className="mt-4 inline-block rounded-full bg-gradient-to-r from-[#6C3BFF] to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:opacity-95"
            >
              {t('ट्विन पर काम करें', 'Act on Twin')}
            </a>
          </motion.div>
        ))}
      </div>

      <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {t('दैनिक वित्तीय नियंत्रण', 'Daily Financial Control')}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {user?.name ? `${user.name} · ` : ''}
            {t('आज का जोखिम, एक स्पष्ट क्रिया, निष्पादन', "today's risk, one clear action, execution")}
            {profileType ? (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                {profileType.replace(/_/g, ' ')}
              </span>
            ) : null}
          </p>
          {engineMeta.updated_at && (
            <p className="mt-1 text-[11px] text-neutral-400">
              {t('लाइव नियंत्रण तल', 'Live control plane')} · tick {engineMeta.tick ?? '–'} ·{' '}
              {t('अपडेट', 'updated')} {new Date(engineMeta.updated_at).toLocaleTimeString()}{' '}
              <span className="text-emerald-700">· {t('३ सेकंड पोलिंग', 'polling 3s')}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#sms-ingest"
            className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline"
          >
            {t('SMS / UPI इन्जेस्ट', 'SMS / UPI ingest')}
          </a>
          <Link
            to="/documents"
            className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline"
          >
            {t('दस्तावेज़ बुद्धिमत्ता', 'Document intelligence')}
          </Link>
          <Link
            to="/assistant"
            className="text-sm font-medium text-neutral-600 underline-offset-2 hover:underline"
          >
            {t('आवाज़ सहायक', 'Voice assistant')}
          </Link>
          <Link
            to="/onboarding"
            className="text-sm font-medium text-neutral-600 underline-offset-2 hover:underline"
          >
            {t('बिज़नेस प्रोफ़ाइल संपादित करें', 'Edit business profile')}
          </Link>
          <button
            type="button"
            onClick={() => void refreshSnapshot()}
            disabled={loading}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? t('लोड हो रहा है…', 'Loading…') : t('अभी रिफ़्रेश करें', 'Refresh now')}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            {t('लॉग आउट', 'Log out')}
          </button>
        </div>
      </header>

      {needsOnboarding && (
        <div
          className="mb-8 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <span className="font-medium">{t('ऑनबोर्डिंग पूरी करें', 'Complete onboarding')}</span>{' '}
          {t(
            'व्यक्तिगत मॉड्यूल लेआउट और ट्रस्ट स्कोर के लिए।',
            'for a personalized module layout and trust scores.'
          )}{' '}
          <Link to="/onboarding" className="font-medium underline">
            {t('ऑनबोर्डिंग पर जाएँ', 'Go to onboarding')}
          </Link>
        </div>
      )}

      {error && (
        <div
          className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      {engineMeta.status === 'error' && engineMeta.error && (
        <div
          className="mb-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900 font-mono whitespace-pre-wrap max-h-48 overflow-auto"
          role="alert"
        >
          <span className="font-sans font-semibold">Engine error: </span>
          {engineMeta.error}
        </div>
      )}

      {/* Daily control – primary WOW */}
      <section
        className={`mb-8 rounded-2xl border p-6 shadow-sm ${
          riskUrgent
            ? 'border-red-200 bg-gradient-to-br from-red-50/90 to-white'
            : 'border-neutral-200/80 bg-white'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Today your business needs this
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="text-xs font-medium text-neutral-500">Today&apos;s risk</p>
            <p className="mt-2 text-lg font-semibold text-neutral-900">Cash shortage probability</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900">
              {loading ? '–' : formatPct(risk)}
            </p>
            <p className="mt-3 text-sm leading-snug text-neutral-700">
              {runwaySummary ||
                (daysToNeg != null
                  ? `You may run out of cash in about ${daysToNeg} day${daysToNeg === 1 ? '' : 's'}.`
                  : 'Stress timing is within the simulated horizon – still chase dues to improve buffer.')}
            </p>
          </div>
          <div className="lg:col-span-1 border-l border-neutral-100 pl-0 lg:pl-6">
            <p className="text-xs font-medium text-neutral-500">What to do</p>
            {primaryAction?.action === 'collect_payment' ? (
              <>
                <p className="mt-2 text-lg font-semibold text-neutral-900">
                  Collect {formatInr(collectAmount)} from {collectName}
                </p>
                <p className="mt-2 text-sm text-neutral-600">{primaryAction.reason}</p>
                {riskAfterCollect != null && (
                  <p className="mt-3 text-sm font-medium text-emerald-900">
                    Impact: risk {formatPct(risk)} → {formatPct(riskAfterCollect)}
                  </p>
                )}
              </>
            ) : primaryAction ? (
              <>
                <p className="mt-2 text-lg font-semibold text-neutral-900">
                  {primaryAction.action.replace(/_/g, ' ')}
                </p>
                <p className="mt-2 text-sm text-neutral-600">{primaryAction.reason}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-600">
                No urgent action – keep monitoring inflows.
              </p>
            )}
          </div>
          <div className="lg:col-span-1 border-l border-neutral-100 pl-0 lg:pl-6">
            <p className="text-xs font-medium text-neutral-500">Cash on hand</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-neutral-900">
              {loading ? '–' : formatInr(snap?.cash)}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Model confidence {confidence != null ? `${(confidence * 100).toFixed(0)}%` : '–'} · updates every few
              seconds
            </p>
          </div>
        </div>
      </section>

      {/* Collection engine – phone + tone feed Recover money + row actions */}
      <section className="mb-8 rounded-2xl border border-violet-200/50 bg-white/75 p-6 shadow-lg shadow-violet-500/5 backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            Collection priority
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex items-center gap-2 text-xs text-violet-800/90">
              <span className="whitespace-nowrap font-medium">WhatsApp to</span>
              <input
                type="tel"
                placeholder="10-digit mobile"
                value={collectPhone}
                onChange={(e) => setCollectPhone(e.target.value)}
                className="w-40 rounded-lg border border-violet-200/80 bg-white px-2 py-1.5 text-sm tabular-nums text-violet-950 shadow-sm focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/15"
                aria-label="Phone number for WhatsApp reminders"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-violet-800/90">
              <span className="font-medium">Tone</span>
              <select
                value={waTone}
                onChange={(e) => setWaTone(e.target.value)}
                className="rounded-lg border border-violet-200/80 bg-white px-2 py-1.5 text-sm text-violet-950 shadow-sm focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/15"
              >
                <option value="formal">Formal</option>
                <option value="friendly">Friendly (Hinglish)</option>
              </select>
            </label>
            {collectionQueue[0] && (
              <button
                type="button"
                onClick={() => void sendWhatsappReminder(collectionQueue[0].name, collectionQueue[0].amount)}
                disabled={waBusy}
                className="rounded-full border-2 border-[#22C55E] bg-[#22C55E]/10 px-4 py-1.5 text-sm font-semibold text-emerald-900 shadow-[0_0_20px_-4px_rgba(34,197,94,0.45)] transition hover:bg-[#22C55E]/20 disabled:opacity-50"
              >
                {waBusy ? 'Sending…' : `WhatsApp ${collectionQueue[0].name.split('(')[0].trim()}`}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-violet-950/50">
          Queue is built server-side from receivable exposure (demo names/amounts). Same phone &amp; tone apply to Recover
          money below. WhatsApp opens wa.me with a khaata-style message and a Razorpay payment link from{' '}
          <code className="rounded bg-violet-100 px-1">POST /execute/payment-link</code>. Call opens your device dialer.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-200/60 text-xs uppercase tracking-wide text-violet-400">
                <th className="py-2 pr-4">Who</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Days late</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectionQueue.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="py-4 text-violet-950/55">
                    Connect ledger data – collection queue fills from receivable exposure.
                  </td>
                </tr>
              ) : (
                collectionQueue.map((row) => (
                  <tr key={row.name} className="border-b border-violet-100/80">
                    <td className="py-3 font-medium text-violet-950">{row.name}</td>
                    <td className="py-3 tabular-nums text-violet-900">{formatInr(row.amount)}</td>
                    <td className="py-3 text-violet-900">{row.days_late}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.priority === 'high'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-50 text-amber-900'
                        }`}
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void sendWhatsappReminder(row.name, row.amount)}
                          disabled={waBusy || rzpBusy}
                          className="rounded-full border-2 border-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-[#22C55E]/20 disabled:opacity-50"
                        >
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyRowPaymentLink(row.name, row.amount)}
                          disabled={rzpBusy || waBusy}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                          title="Copy Razorpay payment link"
                        >
                          <Link2 className="h-3.5 w-3.5" aria-hidden />
                          Link
                        </button>
                        <button
                          type="button"
                          onClick={() => void openCallModal(row.name, row.amount)}
                          className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-900 hover:bg-violet-50"
                        >
                          Call
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* If you act vs do nothing */}
      {outcomes && (
        <section className="mb-8 rounded-xl border border-neutral-200/80 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            What happens if you act?
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
              <p className="text-xs font-medium uppercase text-red-800">Do nothing</p>
              <p className="mt-2 text-sm font-medium text-neutral-900">{outcomes.if_do_nothing?.label}</p>
              <p className="mt-1 text-xs text-neutral-600">{outcomes.if_do_nothing?.summary}</p>
              <p className="mt-2 text-xs text-neutral-500">Risk stays ~{formatPct(outcomes.if_do_nothing?.risk_stays)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-xs font-medium uppercase text-emerald-900">Collect</p>
              <p className="mt-2 text-sm font-medium text-neutral-900">
                ~{formatInr(outcomes.if_collect?.amount_inr)} from overdue
              </p>
              <p className="mt-1 text-xs text-neutral-600">{outcomes.if_collect?.summary}</p>
              <p className="mt-2 text-xs font-medium text-emerald-900">
                Risk → {formatPct(outcomes.if_collect?.risk_after)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-xs font-medium uppercase text-amber-900">Delay supplier</p>
              <p className="mt-2 text-sm text-neutral-800">Defer a non-critical payable</p>
              <p className="mt-1 text-xs text-neutral-600">{outcomes.if_delay_supplier?.summary}</p>
              <p className="mt-2 text-xs text-neutral-600">Risk → {formatPct(outcomes.if_delay_supplier?.risk_after)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Primary execution – uses collectPhone + waTone from Collection priority */}
      {(primaryAction || collectionQueue.length > 0) && (
        <section className="mb-8 rounded-2xl border border-violet-950/20 bg-gradient-to-br from-violet-950 via-violet-900 to-neutral-900 p-6 text-white shadow-[0_24px_50px_-12px_rgba(76,29,149,0.45)]">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">Recover money</h2>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-violet-200/90">Primary move today</p>
              <p className="mt-1 text-xl font-semibold">
                {primaryAction?.action === 'collect_payment' || !primaryAction
                  ? `Collect ${formatInr(collectAmount)} from ${collectName.split('(')[0].trim()}`
                  : primaryAction.action.replace(/_/g, ' ')}
              </p>
              <p className="mt-2 text-xs text-violet-300/80">
                Phone &amp; tone: <span className="font-mono text-white/90">{collectPhone.replace(/\D/g, '').slice(-10) || '–'}</span> ·{' '}
                {waTone === 'friendly' ? 'Friendly (Hinglish)' : 'Formal'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => void sendWhatsappReminder(collectName, collectAmount)}
                disabled={waBusy}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-violet-950 shadow-lg shadow-black/20 hover:bg-violet-50 disabled:opacity-50"
              >
                {waBusy ? 'Sending…' : 'Send WhatsApp reminder'}
              </button>
              <button
                type="button"
                onClick={handleRazorpayLink}
                disabled={rzpBusy}
                className="rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-medium text-white backdrop-blur hover:bg-white/10 disabled:opacity-50"
              >
                {rzpBusy ? 'Creating…' : 'Send payment request'}
              </button>
              <button
                type="button"
                onClick={() => void openCallModal(collectName, collectAmount)}
                className="rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-medium text-white backdrop-blur hover:bg-white/10"
              >
                Call customer
              </button>
              <button
                type="button"
                onClick={() => void handleAutoHandle()}
                disabled={autoBusy}
                className="rounded-full bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-[0_0_24px_-4px_rgba(34,197,94,0.55)] hover:bg-[#4ADE80] disabled:opacity-50"
              >
                {autoBusy ? 'Working…' : 'Let system handle this'}
              </button>
            </div>
          </div>
          {rzpResult && !rzpResult.error && rzpResult.payment_link && (
            <a
              href={rzpResult.payment_link}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-medium text-emerald-300 underline"
            >
              Open payment link
            </a>
          )}
          {rzpResult?.mock && (
            <p className="mt-2 text-xs text-violet-300/80">Mock link when Razorpay keys are not set.</p>
          )}
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-violet-200/85">
            When customers pay through a live link, your server can record the capture in the ledger via the Razorpay
            webhook (<code className="rounded bg-white/10 px-1">POST /webhooks/razorpay</code> with{' '}
            <code className="rounded bg-white/10 px-1">RAZORPAY_WEBHOOK_SECRET</code>). See{' '}
            <Link to="/transactions" className="font-medium text-emerald-200 underline-offset-2 hover:underline">
              Transactions
            </Link>{' '}
            for mixed sources (SMS, AA, webhook).
          </p>
          {rzpResult?.error && <p className="mt-2 text-xs text-red-300">{rzpResult.error}</p>}
          {autoTrail?.steps && (
            <ul className="mt-4 space-y-1 border-t border-white/10 pt-4 text-xs text-violet-200/90">
              {autoTrail.steps.map((s) => (
                <li key={s}>✓ {s}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section
        id="data-connection"
        className="mb-10 scroll-mt-28 rounded-xl border border-neutral-200/80 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Data connection
          </h2>
        </div>
        <p className="text-xs text-neutral-500">
          Onboarding only records <em>intent</em>. Wire channels here: paste bank/UPI SMS text (calls{' '}
          <code className="rounded bg-neutral-100 px-1 text-[11px]">POST /transactions/sms</code>), connect Paytm
          (mock), or upload PDF/CSV via Document intelligence. For{' '}
          <strong className="font-medium text-neutral-700">Account Aggregator</strong> bank feeds and{' '}
          <strong className="font-medium text-neutral-700">morning WhatsApp briefing</strong> / inbound bot settings, use{' '}
          <Link to="/profile" className="font-medium text-[#6C3BFF] underline-offset-2 hover:underline">
            Settings &amp; profile
          </Link>
          .
        </p>

        <div
          id="sms-ingest"
          className="scroll-mt-28 mt-5 rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-4"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-900/80">
            SMS / UPI text ingest
          </h3>
          <p className="mt-1 text-xs text-neutral-600">
            Paste one or more bank/UPI messages (amounts like ₹500 or Rs 500).
          </p>
          <textarea
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            rows={4}
            placeholder="e.g. Rs.2,500.00 credited to A/c XX1234 via UPI"
            className="mt-2 w-full rounded-md border border-emerald-200/80 bg-white px-3 py-2 text-sm font-mono shadow-sm"
            aria-label="Paste SMS text for UPI or bank messages"
          />
          <button
            type="button"
            onClick={() => void handleSmsIngest()}
            disabled={smsBusy || !smsText.trim()}
            className="mt-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
          >
            {smsBusy ? 'Ingesting…' : 'Ingest SMS text'}
          </button>
          {smsToast && (
            <p
              className={`mt-2 text-xs ${smsToast.type === 'error' ? 'text-red-700' : 'text-emerald-800'}`}
              role="status"
            >
              {smsToast.text}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-neutral-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Paytm &amp; bank documents
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/documents"
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Bank / docs → Document intelligence
            </Link>
            <button
              type="button"
              onClick={handleConnectPaytm}
              disabled={paytmBusy || paytmConnected}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {paytmConnected ? 'Paytm connected' : paytmBusy ? 'Connecting…' : 'Connect Paytm'}
            </button>
          </div>
          {paytmConnected && (
            <p className="mt-2 text-sm text-neutral-600">
              Merchant link active. Mock settlement feed available below.
            </p>
          )}
          {paytmPreview?.transactions?.length > 0 && (
            <ul className="mt-4 max-h-40 overflow-auto text-xs text-neutral-600">
              {paytmPreview.transactions.slice(0, 6).map((t) => (
                <li key={t.id} className="flex justify-between border-b border-neutral-100 py-1">
                  <span>{t.description}</span>
                  <span className="tabular-nums">{formatInr(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200/80 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            GST & compliance
          </h2>
          {gst ? (
            <>
              <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                {formatInr(gst.gst_due)}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Due by {gst.due_date}
                {gst.gst_registered ? '' : ' · '}
                {!gst.gst_registered && <span className="text-amber-700">{gst.note}</span>}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-500">–</p>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200/80 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Fraud & anomalies
          </h2>
          <ul className="space-y-2 text-sm text-neutral-700">
            {(snap?.alerts || []).map((a, i) => (
              <li
                key={i}
                className={`rounded border px-3 py-2 ${
                  typeof a === 'string'
                    ? 'border-amber-100 bg-amber-50/50'
                    : 'border-orange-100 bg-orange-50/50'
                }`}
              >
                {formatAlertLine(a, formatInr)}
              </li>
            ))}
            {!snap?.alerts?.length && !loading && (
              <li className="text-neutral-500">No elevated signals on current ledger.</li>
            )}
          </ul>
        </div>
      </section>

      <details className="mb-10 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-4 text-sm text-neutral-700">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Charts &amp; profile (optional)
        </summary>
        <div className="mt-4 space-y-6">
          {snap?.risk_explanation && (
            <p className="text-xs text-neutral-600">{snap.risk_explanation}</p>
          )}
          <div>
            <p className="text-xs font-medium text-neutral-500">Ledger balance trend</p>
            {cashFlowSeries.length === 0 && !loading ? (
              <p className="mt-2 text-sm text-neutral-500">No series data.</p>
            ) : (
              <div className="mt-2 h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={cashFlowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="twinBalanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6C3BFF" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e9d5ff" vertical={false} strokeOpacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#6b21a8' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e9d5ff' }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#6b21a8' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e9d5ff' }}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #e9d5ff',
                        borderRadius: '12px',
                        fontSize: '12px',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(8px)',
                      }}
                      formatter={(v) => [formatInr(v), 'Balance']}
                    />
                    <ReferenceLine y={0} stroke="#c4b5fd" strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      fill="url(#twinBalanceFill)"
                      stroke="none"
                      isAnimationActive
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="#6C3BFF"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500">Business focus modules</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {modules.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => postUserInteraction({ event: 'module_click', module: m.name }).catch(() => {})}
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs capitalize text-neutral-800"
                >
                  {m.name} · {(m.priority * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      {kpiModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kpi-modal-title"
          onClick={() => setKpiModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-100 px-5 py-4">
              <h2 id="kpi-modal-title" className="text-lg font-semibold text-neutral-900">
                {kpiModal === 'cash' && 'Cash'}
                {kpiModal === 'revenue' && 'Revenue pulse'}
                {kpiModal === 'risk' && 'Risk'}
                {kpiModal === 'receivables' && 'Receivables'}
              </h2>
              <p className="mt-1 text-xs text-neutral-500">Where this number comes from and how to move it</p>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm text-neutral-700">
              {kpiModal === 'cash' && (
                <>
                  <p>
                    <strong className="text-neutral-900">Source:</strong> <code className="text-xs">snap.cash</code>{' '}
                    from <code className="text-xs">GET /system/state</code> – your reconciled cash position in the
                    ledger (refreshes every few seconds).
                  </p>
                  <p>
                    <strong className="text-neutral-900">Change it:</strong> add or correct money-in / money-out via
                    SMS ingest, Paytm mock, document uploads, or inventory lines that post as cash movements.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href="#sms-ingest"
                      onClick={() => setKpiModal(null)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                    >
                      SMS ingest
                    </a>
                    <a
                      href="#data-connection"
                      onClick={() => setKpiModal(null)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                    >
                      Data connection
                    </a>
                    <Link
                      to="/inventory"
                      onClick={() => setKpiModal(null)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                    >
                      Inventory / khata
                    </Link>
                  </div>
                </>
              )}
              {kpiModal === 'revenue' && (
                <>
                  <p>
                    <strong className="text-neutral-900">Source:</strong> a <em>demo proxy</em> –{' '}
                    <code className="text-xs">cash × 8%</code>. It is not a real revenue time series yet.
                  </p>
                  <p>
                    <strong className="text-neutral-900">Change it:</strong> anything that moves cash (ingest,
                    inventory, corrections) will move this proxy. A dedicated revenue metric will replace this when
                    wired to real sales data.
                  </p>
                  <Link
                    to="/transactions"
                    onClick={() => setKpiModal(null)}
                    className="inline-block rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                  >
                    View transactions
                  </Link>
                </>
              )}
              {kpiModal === 'risk' && (
                <>
                  <p>
                    <strong className="text-neutral-900">Source:</strong> <code className="text-xs">snap.risk</code>{' '}
                    (horizon risk, shown as a percentage). Comes from the same system state payload as the chart below.
                  </p>
                  {snap?.risk_explanation && (
                    <p className="rounded-lg bg-violet-50/80 px-3 py-2 text-sm text-violet-950">
                      {snap.risk_explanation}
                    </p>
                  )}
                  <p>
                    <strong className="text-neutral-900">Change it:</strong> improve cash runway and collections; risk
                    updates as the twin re-simulates from your data.
                  </p>
                  <Link
                    to="/risk"
                    onClick={() => setKpiModal(null)}
                    className="inline-block rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                  >
                    Open Risk page
                  </Link>
                </>
              )}
              {kpiModal === 'receivables' && (
                <>
                  <p>
                    <strong className="text-neutral-900">Source:</strong> sum of{' '}
                    <code className="text-xs">daily_control.collection_queue</code> amounts from{' '}
                    <code className="text-xs">GET /system/state</code>.
                  </p>
                  {collectionQueue.length > 0 ? (
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2 text-xs">
                      {collectionQueue.map((r, idx) => (
                        <li key={`${r.name}-${idx}`} className="flex justify-between gap-2 tabular-nums">
                          <span className="truncate text-neutral-800">{r.name || 'Customer'}</span>
                          <span className="shrink-0 font-medium">{formatInr(r.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-500">Queue is empty – nothing due in the current snapshot.</p>
                  )}
                  <p>
                    <strong className="text-neutral-900">Change it:</strong> when you log collections or the twin
                    suggests dues, this total reflects who still owes you.
                  </p>
                  <a
                    href="#sms-ingest"
                    onClick={() => setKpiModal(null)}
                    className="inline-block rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-[#6C3BFF] hover:bg-neutral-50"
                  >
                    Ingest payments (SMS)
                  </a>
                </>
              )}
            </div>
            <div className="border-t border-neutral-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setKpiModal(null)}
                className="w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {callModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-modal-title"
        >
          <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h2 id="call-modal-title" className="text-lg font-semibold text-neutral-900">
              Call (demo)
            </h2>
            {callModal.phase === 'done' && (
              <>
                <p className="mt-3 text-sm text-neutral-600">
                  We opened your dialer to <span className="font-mono text-neutral-900">+91 {callModal.phone}</span> (the
                  number in &quot;WhatsApp to&quot;). Use this script if you like:
                </p>
                <p className="mt-2 text-sm font-medium text-neutral-800">Suggested wording</p>
                <p className="mt-2 rounded-lg bg-violet-50/80 px-3 py-2 text-sm leading-relaxed text-violet-950">
                  {callModal.script}
                </p>
                <p className="mt-4 text-sm text-neutral-700">
                  Payment likelihood (demo):{' '}
                  <span className="font-bold uppercase tracking-wide text-emerald-600">
                    {String(callModal.likelihood || '–').toUpperCase()}
                  </span>
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  No backend telephony – this is a local mock. On desktop, <code className="rounded bg-neutral-100 px-1">tel:</code>{' '}
                  may do nothing unless a phone app is linked.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => setCallModal(null)}
              className="mt-6 w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'border-neutral-200 bg-white text-neutral-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
          role="status"
        >
          <p>{toast.text}</p>
          {toast.link && (
            <a
              href={toast.link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs font-medium text-blue-700 underline"
            >
              Open payment link
            </a>
          )}
        </div>
      )}
    </div>
  )
}
