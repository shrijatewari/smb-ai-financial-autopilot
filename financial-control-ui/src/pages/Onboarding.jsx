import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage, getOnboardingState, submitOnboarding } from '../services/api'
import { OnboardingDocumentStep } from './OnboardingDocumentStep'

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
    purpose: 'Mixed product + service – balanced module mix.',
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
    purpose: 'Higher scale – stronger compliance & cash emphasis.',
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
  const { user, loadMe } = useAuth()
  /** True when user finished both document + business steps – allow return to this page to edit (no redirect to Today). */
  const reviewMode = !!(user?.documents_uploaded && user?.onboarding_completed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [literacyPreference, setLiteracyPreference] = useState('standard')
  const [revenueModel, setRevenueModel] = useState('product')
  const [industryDetail, setIndustryDetail] = useState('')
  const [monthlyTurnoverRange, setMonthlyTurnoverRange] = useState('50k_to_5L')
  const [numEmployees, setNumEmployees] = useState(3)
  const [inventoryType, setInventoryType] = useState('low')
  const [creditUsage, setCreditUsage] = useState('none')
  const [cashPct, setCashPct] = useState(40)
  const [gstRegistered, setGstRegistered] = useState(false)
  const [gstin, setGstin] = useState('')
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
        if (cancelled) return
        if (ob && typeof ob === 'object' && ob.revenue_model) {
        setRevenueModel(String(ob.revenue_model))
        const bt = String(ob.business_type || '')
        const sep = ' – '
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
        if (ob.gstin) setGstin(String(ob.gstin))
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
        if (ob.literacy_preference === 'minimal' || ob.literacy_preference === 'standard') {
          setLiteracyPreference(String(ob.literacy_preference))
        }
        } else if (!reviewMode) {
        try {
          const raw = localStorage.getItem('onboarding_draft_v1')
          if (!raw) return
          const d = JSON.parse(raw)
          if (!d || typeof d !== 'object') return
          if (d.revenueModel) setRevenueModel(String(d.revenueModel))
          if (d.industryDetail != null) setIndustryDetail(String(d.industryDetail))
          if (d.monthlyTurnoverRange) setMonthlyTurnoverRange(String(d.monthlyTurnoverRange))
          if (d.numEmployees != null) setNumEmployees(Number(d.numEmployees))
          if (d.inventoryType) setInventoryType(String(d.inventoryType))
          if (d.creditUsage) setCreditUsage(String(d.creditUsage))
          if (typeof d.cashPct === 'number') setCashPct(d.cashPct)
          if (typeof d.gstRegistered === 'boolean') setGstRegistered(d.gstRegistered)
          if (d.gstin) setGstin(String(d.gstin))
          if (typeof d.hasBankData === 'boolean') setHasBankData(d.hasBankData)
          if (typeof d.hasInvoices === 'boolean') setHasInvoices(d.hasInvoices)
          if (d.customerType) setCustomerType(String(d.customerType))
          if (d.literacyPreference) setLiteracyPreference(String(d.literacyPreference))
          if (d.notes != null) setNotes(String(d.notes))
          if (typeof d.dataNone === 'boolean') setDataNone(d.dataNone)
          if (typeof d.dataPaytm === 'boolean') setDataPaytm(d.dataPaytm)
          if (typeof d.dataBank === 'boolean') setDataBank(d.dataBank)
          if (typeof d.dataSms === 'boolean') setDataSms(d.dataSms)
        } catch {
          /* ignore */
        }
        }
      } catch {
        /* first-time users */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reviewMode])

  /* Local draft while Step 2 is in progress – survives refresh until you save or sign out device. */
  useEffect(() => {
    if (reviewMode) return
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          'onboarding_draft_v1',
          JSON.stringify({
            literacyPreference,
            revenueModel,
            industryDetail,
            monthlyTurnoverRange,
            numEmployees,
            inventoryType,
            creditUsage,
            cashPct,
            gstRegistered,
            gstin,
            hasBankData,
            hasInvoices,
            customerType,
            dataPaytm,
            dataBank,
            dataSms,
            dataNone,
            notes,
          })
        )
      } catch {
        /* quota / private mode */
      }
    }, 1200)
    return () => window.clearTimeout(id)
  }, [
    reviewMode,
    literacyPreference,
    revenueModel,
    industryDetail,
    monthlyTurnoverRange,
    numEmployees,
    inventoryType,
    creditUsage,
    cashPct,
    gstRegistered,
    gstin,
    hasBankData,
    hasInvoices,
    customerType,
    dataPaytm,
    dataBank,
    dataSms,
    dataNone,
    notes,
  ])

  if (!user) return null

  if (!user.documents_uploaded) {
    return <OnboardingDocumentStep onSuccess={() => void loadMe()} />
  }

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
        ? `${label} – ${industryDetail.trim()}`
        : label

      let data_sources = []
      if (!dataNone) {
        data_sources = [dataPaytm && 'paytm', dataBank && 'bank', dataSms && 'sms'].filter(Boolean)
      }

      const payload = {
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
        gstin: gstRegistered ? gstin.replace(/\s/g, '').toUpperCase().slice(0, 15) || null : null,
        has_bank_data: hasBankData,
        has_invoices: hasInvoices,
        customer_type: customerType,
        data_sources: dataNone ? ['none'] : data_sources,
        notes: notes.trim() || null,
        literacy_preference: literacyPreference,
      }
      await submitOnboarding(payload)
      try {
        localStorage.removeItem('onboarding_draft_v1')
      } catch {
        /* ignore */
      }
      await loadMe()
      navigate(reviewMode ? '/profile' : '/', { replace: true })
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
            {reviewMode ? 'Aapka business profile' : 'Step 2 of 2'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-violet-950">
            {reviewMode ? 'Review & update' : 'Business profile'}
          </h1>
          <p className="mt-2 text-sm text-violet-950/70">
            {reviewMode ? (
              <>
                Changes save to your account on <strong className="font-medium text-violet-950">Save</strong>. Use this
                anytime from the sidebar.
              </>
            ) : (
              <>
                Ye answers aapka <strong className="font-medium text-violet-950">daily action screen</strong> banate hain:
                kya dikhna hai, kya chhupana hai – generic dashboard nahi.
              </>
            )}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <QuestionBlock
            n={1}
            title="Screen kaise chahiye? (padhai / comfort)"
            purpose="Kam text + zyada awaz + icons – low literacy ke liye. Standard = normal labels."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setLiteracyPreference('minimal')}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  literacyPreference === 'minimal'
                    ? 'border-[#6C3BFF] bg-gradient-to-br from-[#6C3BFF] to-violet-600 text-white shadow-lg'
                    : 'border-violet-200/80 bg-white/90 text-violet-950 hover:border-violet-300'
                }`}
              >
                <span className="font-medium">Simple (kam padhai)</span>
                <span className={`mt-1 block text-xs ${literacyPreference === 'minimal' ? 'text-white/85' : 'text-violet-950/55'}`}>
                  Icons + voice, kam akshar
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLiteracyPreference('standard')}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  literacyPreference === 'standard'
                    ? 'border-[#6C3BFF] bg-gradient-to-br from-[#6C3BFF] to-violet-600 text-white shadow-lg'
                    : 'border-violet-200/80 bg-white/90 text-violet-950 hover:border-violet-300'
                }`}
              >
                <span className="font-medium">Standard</span>
                <span className={`mt-1 block text-xs ${literacyPreference === 'standard' ? 'text-white/85' : 'text-violet-950/55'}`}>
                  Normal text + buttons
                </span>
              </button>
            </div>
          </QuestionBlock>

          <QuestionBlock
            n={3}
            title="What type of business do you run?"
            purpose="Core signal – sets retail vs service mix and inventory vs customer emphasis."
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
            n={4}
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
            n={5}
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
            n={6}
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
            n={7}
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
            n={8}
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
            n={9}
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
            {gstRegistered && (
              <div className="mt-4">
                <label className="text-xs font-medium text-violet-800/80" htmlFor="gstin-input">
                  GSTIN (15 characters)
                </label>
                <input
                  id="gstin-input"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  className="mt-1 w-full rounded-xl border border-violet-200/80 px-3 py-2.5 font-mono text-sm tracking-wide text-violet-950"
                />
              </div>
            )}
          </QuestionBlock>

          <QuestionBlock
            n={10}
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
                <strong>Paytm</strong> – main <strong>Dashboard</strong> → “Connect Paytm” (demo merchant link + mock
                feed).
              </span>
              <br />
              <span className="text-violet-900/80">
                <strong>Bank / statements</strong> – <strong>Document intelligence</strong> (<code className="rounded bg-violet-200/80 px-1">/documents</code>
                ): upload PDF or image exports; text feeds business context (CSV ledger upload via API/Swagger if
                enabled).
              </span>
              <br />
              <span className="text-violet-900/80">
                <strong>SMS / UPI</strong> –{' '}
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
            n={11}
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

          <QuestionBlock n={12} title="Notes (optional)" purpose="Anything else the system should know.">
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
              {busy ? 'Saving…' : reviewMode ? 'Save changes' : 'Save & open Aaj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
