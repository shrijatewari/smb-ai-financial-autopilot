import { useCallback, useEffect, useState } from 'react'
import {
  fetchCollectionCustomers,
  fetchCollectionLadders,
  fetchCreditScore,
  fetchGrowthBenchmarks,
  fetchGrowthSummary,
  fetchSupplierInsights,
  getApiErrorMessage,
  postCollectionLadderStart,
  postGrowthBenchmarksRefresh,
  postGrowthSubscription,
} from '../services/api'
import { useTr } from '../hooks/useTr'
import { Button } from '../components/ui/button'
import { TrendingUp, Copy, RefreshCw, Users, Building2, BarChart3 } from 'lucide-react'

export default function Growth() {
  const t = useTr()
  const [err, setErr] = useState(null)
  const [credit, setCredit] = useState(null)
  const [summary, setSummary] = useState(null)
  const [ladders, setLadders] = useState([])
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState(null)
  const [benchmarks, setBenchmarks] = useState(null)
  const [busy, setBusy] = useState(false)
  const [custId, setCustId] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    const jobs = [
      ['growth/summary', fetchGrowthSummary],
      ['credit/score', () => fetchCreditScore(false)],
      ['collections/ladder', fetchCollectionLadders],
      ['collections/customers', fetchCollectionCustomers],
      ['insights/suppliers', fetchSupplierInsights],
      ['growth/benchmarks', fetchGrowthBenchmarks],
    ]
    const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()))
    const failed = []
    settled.forEach((r, i) => {
      if (r.status === 'rejected') {
        failed.push(`${jobs[i][0]}: ${getApiErrorMessage(r.reason)}`)
        return
      }
      const v = r.value
      switch (i) {
        case 0:
          setSummary(v)
          break
        case 1:
          setCredit(v)
          break
        case 2:
          setLadders(v.items || [])
          break
        case 3:
          setCustomers(v.items || [])
          break
        case 4:
          setSuppliers(v)
          break
        case 5:
          setBenchmarks(v)
          break
        default:
          break
      }
    })
    if (failed.length) {
      setErr(failed.join(' · '))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onRefreshCredit() {
    setBusy(true)
    try {
      setCredit(await fetchCreditScore(true))
    } catch (e) {
      setErr(getApiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onTier(tier) {
    setBusy(true)
    try {
      await postGrowthSubscription(tier)
      setSummary(await fetchGrowthSummary())
    } catch (e) {
      setErr(getApiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onStartLadder() {
    const id = parseInt(custId, 10)
    if (!id) return
    setBusy(true)
    try {
      await postCollectionLadderStart(id)
      setLadders((await fetchCollectionLadders()).items || [])
    } catch (e) {
      setErr(getApiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onRefreshBenchmarks() {
    setBusy(true)
    try {
      await postGrowthBenchmarksRefresh()
      setBenchmarks(await fetchGrowthBenchmarks())
    } catch (e) {
      setErr(getApiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function copyCode() {
    const c = summary?.referral_code
    if (c) navigator.clipboard.writeText(c)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-24 pt-8 sm:px-6">
      <div>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-800">
          <TrendingUp className="h-3.5 w-3.5" />
          {t('विकास और मोट', 'Growth & moat')}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-violet-950">
          {t('क्रेडिट · सदस्यता · रेफ़रल', 'Credit · subscription · referrals')}
        </h1>
        <p className="mt-1 text-sm text-violet-800/70">
          {t(
            'लेंडर सिग्नल, एमआरआर टियर, रेफ़रल लूप, १४-दिन वसूली सीढ़ी, देय, बेंचमार्क।',
            'Lender signal, MRR tier, referral loop, 14-day collection ladder, payables, benchmarks.'
          )}
        </p>
      </div>

      {err && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </p>
      )}

      {!err && customers.length === 0 && (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {t(
            'इस खाते में अभी कोई ग्राहक रिकॉर्ड नहीं। सीड उसी डेटाबेस में चलाएँ जिसे API इस्तेमाल करता है, फिर demo@example.com से लॉग इन करें।',
            'No customer rows for this account. Run the backend seed against the same database your API uses, then sign in as demo@example.com (seed creates 5 customers for that user).',
            {
              hinglish:
                'No customer rows for this account. Seed the same DB as the API, then login as demo@example.com – seed adds 5 customers.',
            },
          )}
        </p>
      )}

      <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-violet-950">{t('क्रेडिट स्कोर', 'Credit score')}</h2>
            <p className="text-xs text-violet-800/60">
              {t('लेजर + GST + प्राप्य + RL – ० से १०००', 'Ledger + GST + receivables + RL – 0–1000')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefreshCredit}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {t('नया हिसाब', 'Recompute')}
          </Button>
        </div>
        {credit && (
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-4xl font-bold tabular-nums text-[#6C3BFF]">{credit.score}</p>
              <p className="text-xs text-violet-800/60">
                {t('बैंड', 'Band')}: <span className="font-semibold">{credit.band}</span>
                {credit.cached ? ` · ${t('कैश्ड', 'cached')}` : ''}
              </p>
            </div>
            {credit.factors?.weights && (
              <div className="text-xs text-violet-800/70">
                <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(credit.factors.weights, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur">
        <h2 className="text-sm font-semibold text-violet-950">{t('सदस्यता और रेफ़रल', 'Subscription & referral')}</h2>
        {summary && (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              <span className="text-violet-800/60">{t('टियर', 'Tier')}: </span>
              <span className="font-medium capitalize">{summary.subscription_tier}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {['free', 'pro', 'enterprise'].map((tier) => (
                <Button key={tier} type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onTier(tier)}>
                  {tier}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-violet-50/80 px-3 py-2">
              <code className="text-sm font-mono font-semibold tracking-wider text-violet-950">{summary.referral_code}</code>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs text-violet-800 hover:bg-violet-50"
              >
                <Copy className="h-3 w-3" />
                {t('कॉपी', 'Copy')}
              </button>
            </div>
            <p className="text-violet-800/70">
              {t('रेफ़रल', 'Referrals')}: <strong>{summary.referrals_count}</strong>
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#6C3BFF]" />
          <h2 className="text-sm font-semibold text-violet-950">{t('१४-दिन वसूली सीढ़ी', '14-day collection ladder')}</h2>
        </div>
        <p className="mt-1 text-xs text-violet-800/60">
          {t(
            'हर दिन एक रिमाइंडर – सूचना लॉग + वॉट्सऐप जब API लगा हो',
            'One touch per day – notification log + WhatsApp when API is set'
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs">
            <span className="text-violet-800/70">{t('ग्राहक', 'Customer')}</span>
            <select
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
              className="mt-1 min-w-[200px] rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('चुनो…', 'Select…')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (#{c.id}) – ₹{Number(c.total_due).toFixed(0)}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" disabled={busy || !custId} onClick={onStartLadder}>
            {t('शुरू करो', 'Start ladder')}
          </Button>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {ladders.map((x) => (
            <li key={x.id} className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
              <span className="font-medium">{x.customer_name}</span>
              <span className="text-violet-800/70">
                {' '}
                – step {x.step_index}/14 – {x.status}
              </span>
            </li>
          ))}
          {!ladders.length && <li className="text-violet-800/50">{t('कोई अभियान नहीं', 'No active campaigns')}</li>}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-semibold text-violet-950">{t('देय / आपूर्तिकर्ता', 'Payables / suppliers')}</h2>
        </div>
        {suppliers && (
          <div className="mt-3 space-y-2 text-sm text-violet-900">
            <p>
              {t('कुल डेबिट (लेजर)', 'Total debit (ledger)')}: ₹{Number(suppliers.total_debit_inr).toLocaleString('en-IN')}
            </p>
            <ul className="space-y-1">
              {(suppliers.top_categories || []).slice(0, 8).map((row) => (
                <li key={row.category} className="flex justify-between gap-2 text-xs">
                  <span>{row.category}</span>
                  <span className="tabular-nums">₹{Number(row.amount_inr).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
            {(suppliers.suggestions || []).map((s, i) => (
              <p key={i} className="text-xs text-violet-800/75">
                {s}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-violet-950">{t('समकक्ष बेंचमार्क', 'Peer benchmarks')}</h2>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefreshBenchmarks}>
            {t('डेटा रिफ़्रेश', 'Refresh data')}
          </Button>
        </div>
        <p className="mt-1 text-xs text-violet-800/60">
          {benchmarks?.industry_key
            ? `${t('उद्योग', 'Industry')}: ${benchmarks.industry_key}`
            : t('ऑनबोर्डिंग में व्यवसाय प्रकार सेट करें', 'Set business type in onboarding')}
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(benchmarks?.items || []).map((b) => (
            <li key={`${b.industry_key}-${b.metric}`} className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 text-xs">
              <span className="font-medium">{b.metric}</span>
              <span className="text-violet-800/80">
                {' '}
                – p50 ₹{b.p50 != null ? Math.round(b.p50).toLocaleString('en-IN') : '–'} · p90 ₹
                {b.p90 != null ? Math.round(b.p90).toLocaleString('en-IN') : '–'} · n={b.sample_count}
              </span>
            </li>
          ))}
          {!(benchmarks?.items || []).length && (
            <li className="text-violet-800/50">{t('अभी डेटा कम – रिफ़्रेश या ज़्यादा उपयोगकर्ता', 'Sparse data – refresh or more users')}</li>
          )}
        </ul>
      </section>
    </div>
  )
}
