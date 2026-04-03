import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage, getOnboardingState, submitOnboarding } from '../services/api'

/** Maps to backend revenue_model + human-readable business_type */
const ARCHETYPE = [
  {
    id: 'product',
    title: 'Retail (products)',
    purpose: 'Drives inventory module, stock / demand signals.',
  },
  {
    id: 'service',
    title: 'Service (salon, repair, professional, etc.)',
    purpose: 'Drives customer & retention signals; de-emphasizes inventory.',
  },
  {
    id: 'hybrid',
    title: 'Hybrid',
    purpose: 'Mixed product + service — balanced module mix.',
  },
]

const TURNOVER = [
  {
    value: 'under_50k',
    label: 'Under ₹50k / month',
    purpose: 'Simpler dashboard; coarser granularity.',
  },
  {
    value: '50k_to_5L',
    label: '₹50k – ₹5L',
    purpose: 'Standard SMB band.',
  },
  {
    value: '5L_to_50L',
    label: '₹5L – ₹50L',
    purpose: 'Enables richer trends & forecasting cues.',
  },
  {
    value: '50L_plus',
    label: '₹50L+',
    purpose: 'Higher scale — stronger compliance & cash emphasis.',
  },
]

function QuestionBlock({ n, title, purpose, children }) {
  return (
    <div className="rounded-2xl border border-violet-200/50 bg-white/80 p-5 shadow-md shadow-violet-500/5 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">
        Question {n}
      </p>
      <h2 className="mt-1 text-base font-semibold text-violet-950">{title}</h2>
      {purpose ? <p className="mt-1.5 text-xs leading-relaxed text-violet-950/55">{purpose}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { loadMe } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [revenueModel, setRevenueModel] = useState('product')
  const [industryDetail, setIndustryDetail] = useState('')
  const [monthlyTurnoverRange, setMonthlyTurnoverRange] = useState('50k_to_5L')
  const [numEmployees, setNumEmployees] = useState(3)
  const [inventoryType, setInventoryType] = useState('low')
  const [creditUsage, setCreditUsage] = useState('none')
  const [cashPct, setCashPct] = useState(40)
  const [gstRegistered, setGstRegistered] = useState(false)
  const [hasBankData, setHasBankData] = useState(false)
  const [hasInvoices, setHasInvoices] = useState(false)
  const [customerType, setCustomerType] = useState('repeat')
  const [dataPaytm, setDataPaytm] = useState(false)
  const [dataBank, setDataBank] = useState(false)
  const [dataSms, setDataSms] = useState(false)
  const [dataNone, setDataNone] = useState(true)
  const [notes, setNotes] = useState('')

  const digitalPct = 100 - cashPct

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ob = await getOnboardingState()
        if (cancelled || !ob || typeof ob !== 'object' || !ob.revenue_model) return
        setRevenueModel(String(ob.revenue_model))
        const bt = String(ob.business_type || '')
        const sep = ' — '
        if (bt.includes(sep)) {
          setIndustryDetail(bt.split(sep).slice(1).join(sep).trim())
        }
        if (ob.monthly_turnover_range) setMonthlyTurnoverRange(String(ob.monthly_turnover_range))
        if (ob.num_employees != null) setNumEmployees(Number(ob.num_employees))
        if (ob.inventory_type) setInventoryType(String(ob.inventory_type))
        if (ob.credit_usage) setCreditUsage(String(ob.credit_usage))
        const pm = ob.payment_mix
        if (pm && typeof pm.cash === 'number') setCashPct(Math.round(pm.cash * 100))
        if (typeof ob.gst_registered === 'boolean') setGstRegistered(ob.gst_registered)
        if (typeof ob.has_bank_data === 'boolean') setHasBankData(ob.has_bank_data)
        if (typeof ob.has_invoices === 'boolean') setHasInvoices(ob.has_invoices)
        if (ob.customer_type) setCustomerType(String(ob.customer_type))
        const ds = ob.data_sources
        if (Array.isArray(ds)) {
          if (ds.includes('none') || ds.length === 0) {
            toggleDataNone(true)
          } else {
            setDataNone(false)
            setDataPaytm(ds.includes('paytm'))
            setDataBank(ds.includes('bank'))
            setDataSms(ds.includes('sms'))
          }
        }
        if (ob.notes) setNotes(String(ob.notes))
      } catch {
        /* first-time users */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleDataNone(checked) {
    setDataNone(checked)
    if (checked) {
      setDataPaytm(false)
      setDataBank(false)
      setDataSms(false)
    }
  }

  function toggleDataSource(which, checked) {
    if (checked) setDataNone(false)
    if (which === 'paytm') setDataPaytm(checked)
    if (which === 'bank') setDataBank(checked)
    if (which === 'sms') setDataSms(checked)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const archetype = ARCHETYPE.find((a) => a.id === revenueModel)
      const label = archetype?.title ?? revenueModel
      const business_type = industryDetail.trim()
        ? `${label} — ${industryDetail.trim()}`
        : label

      let data_sources = []
      if (!dataNone) {
        data_sources = [dataPaytm && 'paytm', dataBank && 'bank', dataSms && 'sms'].filter(Boolean)
      }

      await submitOnboarding({
        business_type,
        revenue_model: revenueModel,
        monthly_turnover_range: monthlyTurnoverRange,
        num_employees: Number(numEmployees) || 0,
        inventory_type: inventoryType,
        credit_usage: creditUsage,
        payment_mix: {
          cash: cashPct / 100,
          digital: digitalPct / 100,
        },
        gst_registered: gstRegistered,
        has_bank_data: hasBankData,
        has_invoices: hasInvoices,
        customer_type: customerType,
        data_sources: dataNone ? ['none'] : data_sources,
        notes: notes.trim() || null,
      })
      await loadMe()
      navigate('/', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-transparent via-violet-50/30 to-white px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-violet-950">
            Business profile
          </h1>
          <p className="mt-2 text-sm text-violet-950/70">
            Each answer maps to the <strong className="font-medium text-violet-950">module engine</strong> and{' '}
            <strong className="font-medium text-violet-950">dashboard layout</strong> — not a generic form.
          </p>
          <p className="mt-2 text-xs text-violet-950/50">
            Flow:{' '}
            <span className="font-mono text-[11px] text-violet-800/80">
              onboarding → business vector → modules → dynamic dashboard
            </span>
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <QuestionBlock
            n={1}
            title="What type of business do you run?"
            purpose="Core signal — sets retail vs service mix and inventory vs customer emphasis."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {ARCHETYPE.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setRevenueModel(a.id)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                    revenueModel === a.id
                      ? 'border-[#6C3BFF] bg-gradient-to-br from-[#6C3BFF] to-violet-600 text-white shadow-lg shadow-[#6C3BFF]/25'
                      : 'border-violet-200/80 bg-white/90 text-violet-950 hover:border-violet-300'
                  }`}
                >
                  <span className="font-medium">{a.title}</span>
                  <span
                    className={`mt-1 block text-xs ${
                      revenueModel === a.id ? 'text-white/80' : 'text-violet-950/55'
                    }`}
                  >
                    {a.purpose}
                  </span>
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-violet-600">Industry detail (optional)</span>
              <input
                value={industryDetail}
                onChange={(e) => setIndustryDetail(e.target.value)}
                placeholder="e.g. Kirana, dental clinic, auto parts"
                className="mt-1 w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2 text-sm text-violet-950 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/15"
              />
            </label>
          </QuestionBlock>

          <QuestionBlock
            n={2}
            title="Monthly turnover range (approx.)"
            purpose="Drives scale score, graph richness, and compliance emphasis."
          >
            <select
              value={monthlyTurnoverRange}
              onChange={(e) => setMonthlyTurnoverRange(e.target.value)}
              className="w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 text-sm text-violet-950"
            >
              {TURNOVER.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-violet-950/55">
              {TURNOVER.find((x) => x.value === monthlyTurnoverRange)?.purpose}
            </p>
          </QuestionBlock>

          <QuestionBlock
            n={3}
            title="What % of payments are cash vs digital?"
            purpose="Weights cash inference and liquidity alerts."
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={cashPct}
                onChange={(e) => setCashPct(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-40 text-sm tabular-nums text-violet-900">
                {cashPct}% cash · {digitalPct}% digital
              </span>
            </div>
          </QuestionBlock>

          <QuestionBlock
            n={4}
            title="Do you maintain inventory?"
            purpose="Inventory module, reorder-style signals; hidden for pure service with no stock."
          >
            <select
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value)}
              className="w-full rounded-xl border border-violet-200/80 px-3 py-2.5 text-sm text-violet-950"
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="high_value">High-value (e.g. electronics)</option>
            </select>
          </QuestionBlock>

          <QuestionBlock
            n={5}
            title="Do customers take goods or services on credit?"
            purpose="Credit module strength and collection / receivable actions."
          >
            <select
              value={creditUsage}
              onChange={(e) => setCreditUsage(e.target.value)}
              className="w-full rounded-xl border border-violet-200/80 px-3 py-2.5 text-sm text-violet-950"
            >
              <option value="none">No</option>
              <option value="informal">Informal (khata / verbal)</option>
              <option value="formal">Formal (invoiced / terms)</option>
            </select>
          </QuestionBlock>

          <QuestionBlock
            n={6}
            title="How often do customers return?"
            purpose="Customer insights module priority."
          >
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
              className="w-full rounded-xl border border-violet-200/80 px-3 py-2.5 text-sm text-violet-950"
            >
              <option value="one_time">One-time</option>
              <option value="repeat">Repeat</option>
              <option value="subscription">Subscription-like / retainers</option>
            </select>
          </QuestionBlock>

          <QuestionBlock
            n={7}
            title="Are you GST registered?"
            purpose="GST / compliance module and filing posture."
          >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setGstRegistered(true)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  gstRegistered ? 'border-[#6C3BFF] bg-gradient-to-r from-[#6C3BFF] to-violet-500 text-white' : 'border-violet-200 bg-white text-violet-900'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setGstRegistered(false)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  !gstRegistered ? 'border-[#6C3BFF] bg-gradient-to-r from-[#6C3BFF] to-violet-500 text-white' : 'border-violet-200 bg-white text-violet-900'
                }`}
              >
                No
              </button>
            </div>
          </QuestionBlock>

          <QuestionBlock
            n={8}
            title="Which data can you connect?"
            purpose="Trust score and model confidence when real channels are available."
          >
            <label className="flex items-center gap-2 text-sm text-violet-900">
              <input
                type="checkbox"
                checked={dataNone}
                onChange={(e) => toggleDataNone(e.target.checked)}
                className="rounded border-violet-300"
              />
              None yet
            </label>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-violet-900">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dataPaytm}
                  disabled={dataNone}
                  onChange={(e) => toggleDataSource('paytm', e.target.checked)}
                  className="rounded border-violet-300 disabled:opacity-40"
                />
                Paytm
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dataBank}
                  disabled={dataNone}
                  onChange={(e) => toggleDataSource('bank', e.target.checked)}
                  className="rounded border-violet-300 disabled:opacity-40"
                />
                Bank / statements
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dataSms}
                  disabled={dataNone}
                  onChange={(e) => toggleDataSource('sms', e.target.checked)}
                  className="rounded border-violet-300 disabled:opacity-40"
                />
                SMS / UPI alerts
              </label>
            </div>
            <p className="mt-4 rounded-xl border border-violet-200/60 bg-violet-50/50 px-3 py-2.5 text-xs leading-relaxed text-violet-900/90">
              <span className="font-semibold text-violet-950">Where you actually connect (after login):</span>
              <br />
              <span className="text-violet-900/80">
                <strong>Paytm</strong> — main <strong>Dashboard</strong> → “Connect Paytm” (demo merchant link + mock
                feed).
              </span>
              <br />
              <span className="text-violet-900/80">
                <strong>Bank / statements</strong> — <strong>Document intelligence</strong> (<code className="rounded bg-violet-200/80 px-1">/documents</code>
                ): upload PDF or image exports; text feeds business context (CSV ledger upload via API/Swagger if
                enabled).
              </span>
              <br />
              <span className="text-violet-900/80">
                <strong>SMS / UPI</strong> —{' '}
                <Link to="/#sms-ingest" className="font-medium text-[#6C3BFF] underline underline-offset-2">
                  Dashboard → SMS ingest
                </Link>
                : paste bank/UPI SMS text in the green box under Data connection (same API as{' '}
                <code className="rounded bg-violet-200/80 px-1">POST /transactions/sms</code>).
              </span>
            </p>
            <p className="mt-2 text-[11px] text-violet-950/50">
              This question only records what you <em>plan</em> to connect so trust scores can reflect intent; use the
              links above to wire real data.
            </p>
          </QuestionBlock>

          <QuestionBlock
            n={9}
            title="Operational detail"
            purpose="Headcount helps scale score; document flags help formality."
          >
            <label className="block">
              <span className="text-xs font-medium text-violet-600">Employees (approx.)</span>
              <input
                type="number"
                min={0}
                value={numEmployees}
                onChange={(e) => setNumEmployees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-violet-200/80 px-3 py-2 text-sm text-violet-950"
              />
            </label>
            <div className="mt-4 space-y-2 border-t border-violet-100 pt-4">
              <label className="flex items-center gap-2 text-sm text-violet-900">
                <input
                  type="checkbox"
                  checked={hasBankData}
                  onChange={(e) => setHasBankData(e.target.checked)}
                  className="rounded border-violet-300"
                />
                I can connect bank / statement data
              </label>
              <label className="flex items-center gap-2 text-sm text-violet-900">
                <input
                  type="checkbox"
                  checked={hasInvoices}
                  onChange={(e) => setHasInvoices(e.target.checked)}
                  className="rounded border-violet-300"
                />
                I have invoices / bills on file
              </label>
            </div>
          </QuestionBlock>

          <QuestionBlock n={10} title="Notes (optional)" purpose="Anything else the system should know.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-violet-200/80 px-3 py-2 text-sm text-violet-950"
              placeholder="Optional"
            />
          </QuestionBlock>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {typeof error === 'string' ? error : JSON.stringify(error)}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-gradient-to-r from-[#6C3BFF] to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6C3BFF]/25 hover:opacity-95 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save & open dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
