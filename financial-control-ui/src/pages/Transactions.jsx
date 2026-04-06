import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { useTr } from '../hooks/useTr'
import {
  downloadLedgerCsv,
  fetchLedgerSummary,
  fetchLedgerTransactions,
  fetchPaytmTransactions,
  getApiErrorMessage,
} from '../services/api'
import { mockTransactionsFromState } from '../lib/mockData'
import { cn } from '../lib/utils'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function rowMatchesDescription(row, q) {
  if (!q || !String(q).trim()) return true
  return (row.description || '').toLowerCase().includes(String(q).trim().toLowerCase())
}

function rowMatchesSource(row, source) {
  if (!source || !String(source).trim()) return true
  return (row.source || '') === source
}

function rowMatchesTxnType(row, txnType) {
  if (!txnType || !String(txnType).trim()) return true
  return (row.type || '') === txnType
}

function rowMatchesCategory(row, category) {
  if (!category || !String(category).trim()) return true
  return (row.category || '').toLowerCase() === String(category).trim().toLowerCase()
}

const LEDGER_PAGE_SIZE = 200

const LEDGER_SORT_DEFAULT = 'date_desc'

function mapLedgerRow(tx) {
  const typ = (tx.type || '').toLowerCase()
  const amt = Number(tx.amount)
  return {
    id: `ledger-${tx.id}`,
    date: tx.date || '–',
    description: tx.description || '–',
    amount: amt,
    type: typ === 'credit' ? 'credit' : 'debit',
    confidence: tx.confidence != null && !Number.isNaN(Number(tx.confidence)) ? Number(tx.confidence) : 0.9,
    source: tx.source || 'unknown',
    category: tx.category || '',
  }
}

export default function Transactions() {
  const t = useTr()
  const { snapshot: snap } = useSystemSnapshot()
  const [searchParams, setSearchParams] = useSearchParams()
  const [paytm, setPaytm] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [ledgerSummary, setLedgerSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportErr, setExportErr] = useState(null)
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('date_from') || '')
  const [dateTo, setDateTo] = useState(() => searchParams.get('date_to') || '')
  const [appliedFrom, setAppliedFrom] = useState(() => searchParams.get('date_from') || '')
  const [appliedTo, setAppliedTo] = useState(() => searchParams.get('date_to') || '')
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '')
  const [appliedQ, setAppliedQ] = useState(() => searchParams.get('q') || '')
  const [sourceInput, setSourceInput] = useState(() => searchParams.get('source') || '')
  const [appliedSource, setAppliedSource] = useState(() => searchParams.get('source') || '')
  const [txnTypeInput, setTxnTypeInput] = useState(() => searchParams.get('txn_type') || '')
  const [appliedTxnType, setAppliedTxnType] = useState(() => searchParams.get('txn_type') || '')
  const [sortInput, setSortInput] = useState(() => searchParams.get('sort') || LEDGER_SORT_DEFAULT)
  const [appliedSort, setAppliedSort] = useState(() => searchParams.get('sort') || LEDGER_SORT_DEFAULT)
  const [categoryInput, setCategoryInput] = useState(() => searchParams.get('category') || '')
  const [appliedCategory, setAppliedCategory] = useState(() => searchParams.get('category') || '')
  const [ledgerRefresh, setLedgerRefresh] = useState(0)
  const [ledgerOffset, setLedgerOffset] = useState(0)

  const ledgerTxnTypeOptions = useMemo(
    () => [
      { value: '', label: t('जमा और खर्च', 'Credits & debits') },
      { value: 'credit', label: t('केवल जमा', 'Credits only') },
      { value: 'debit', label: t('केवल खर्च', 'Debits only') },
    ],
    [t]
  )

  const ledgerSortOptions = useMemo(
    () => [
      { value: 'date_desc', label: t('नया पहले', 'Newest first') },
      { value: 'date_asc', label: t('पुराना पहले', 'Oldest first') },
      { value: 'amount_desc', label: t('सबसे बड़ी राशि', 'Largest amount') },
      { value: 'amount_asc', label: t('सबसे छोटी राशि', 'Smallest amount') },
    ],
    [t]
  )

  const ledgerSourceOptions = useMemo(
    () => [
      { value: '', label: t('सभी स्रोत', 'All sources') },
      { value: 'razorpay_webhook', label: t('रेज़रपे', 'Razorpay') },
      { value: 'account_aggregator', label: t('बैंक (AA)', 'Bank (AA)') },
      { value: 'sms', label: t('SMS / UPI', 'SMS / UPI') },
      { value: 'paytm', label: t('Paytm', 'Paytm') },
      { value: 'api', label: t('API', 'API') },
      { value: 'ocr', label: t('OCR', 'OCR') },
      { value: 'ingestion', label: t('इन्जेस्शन', 'Ingestion') },
      { value: 'unknown', label: t('अज्ञात', 'Unknown') },
    ],
    [t]
  )

  const ledgerCategoryOptions = useMemo(
    () => [
      { value: '', label: t('सभी श्रेणियाँ', 'All categories') },
      { value: 'collection', label: t('वसूली', 'Collection') },
      { value: 'revenue', label: t('राजस्व', 'Revenue') },
      { value: 'sale', label: t('बिक्री', 'Sale') },
      { value: 'supplier', label: t('आपूर्तिकर्ता', 'Supplier') },
      { value: 'bank_aa', label: t('बैंक (AA)', 'Bank (AA)') },
      { value: 'expense', label: t('खर्च', 'Expense') },
      { value: 'personal', label: t('निजी', 'Personal') },
      { value: 'unknown', label: t('अज्ञात', 'Unknown') },
    ],
    [t]
  )

  const formatSource = (src) => {
    if (!src) return '–'
    const map = {
      razorpay_webhook: t('रेज़रपे', 'Razorpay'),
      account_aggregator: t('बैंक (AA)', 'Bank (AA)'),
      sms: t('SMS / UPI', 'SMS / UPI'),
      paytm: t('Paytm', 'Paytm'),
      api: t('API', 'API'),
      ocr: t('OCR', 'OCR'),
      unknown: '–',
      ingestion: t('इन्जेस्शन', 'Ingestion'),
    }
    return map[src] || String(src).replace(/_/g, ' ')
  }

  const formatCategory = (cat) => {
    if (!cat) return '–'
    const lower = String(cat).toLowerCase()
    const map = {
      collection: t('वसूली', 'collection'),
      revenue: t('राजस्व', 'revenue'),
      sale: t('बिक्री', 'sale'),
      supplier: t('आपूर्तिकर्ता', 'supplier'),
      bank_aa: t('बैंक (AA)', 'Bank (AA)'),
      expense: t('खर्च', 'expense'),
      personal: t('निजी', 'personal'),
      unknown: t('अज्ञात', 'unknown'),
    }
    return map[lower] || String(cat).replace(/_/g, ' ')
  }

  useEffect(() => {
    const df = searchParams.get('date_from') || ''
    const dt = searchParams.get('date_to') || ''
    const q = searchParams.get('q') || ''
    const src = searchParams.get('source') || ''
    const tt = searchParams.get('txn_type') || ''
    const so = searchParams.get('sort') || LEDGER_SORT_DEFAULT
    const cat = searchParams.get('category') || ''
    setDateFrom(df)
    setDateTo(dt)
    setSearchInput(q)
    setSourceInput(src)
    setTxnTypeInput(tt)
    setAppliedFrom(df)
    setAppliedTo(dt)
    setAppliedQ(q)
    setAppliedSource(src)
    setAppliedTxnType(tt)
    setSortInput(so)
    setAppliedSort(so)
    setCategoryInput(cat)
    setAppliedCategory(cat)
    setLedgerOffset(0)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ledgerParams = { limit: LEDGER_PAGE_SIZE, offset: ledgerOffset }
        const summaryParams = {}
        if (appliedFrom.trim()) {
          ledgerParams.date_from = appliedFrom.trim()
          summaryParams.date_from = appliedFrom.trim()
        }
        if (appliedTo.trim()) {
          ledgerParams.date_to = appliedTo.trim()
          summaryParams.date_to = appliedTo.trim()
        }
        if (appliedQ.trim()) {
          ledgerParams.q = appliedQ.trim()
          summaryParams.q = appliedQ.trim()
        }
        if (appliedSource.trim()) {
          ledgerParams.source = appliedSource.trim()
          summaryParams.source = appliedSource.trim()
        }
        if (appliedTxnType.trim()) {
          ledgerParams.txn_type = appliedTxnType.trim()
          summaryParams.txn_type = appliedTxnType.trim()
        }
        if (appliedSort && appliedSort !== LEDGER_SORT_DEFAULT) {
          ledgerParams.sort = appliedSort
        }
        if (appliedCategory.trim()) {
          ledgerParams.category = appliedCategory.trim()
          summaryParams.category = appliedCategory.trim()
        }
        const [p, l, s] = await Promise.all([
          fetchPaytmTransactions().catch(() => null),
          fetchLedgerTransactions(ledgerParams).catch(() => null),
          fetchLedgerSummary(summaryParams).catch(() => null),
        ])
        if (!cancelled) {
          setPaytm(p)
          setLedger(l)
          setLedgerSummary(s)
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    appliedFrom,
    appliedTo,
    appliedQ,
    appliedSource,
    appliedTxnType,
    appliedCategory,
    appliedSort,
    ledgerOffset,
    ledgerRefresh,
  ])

  const { rows: mockRows } = mockTransactionsFromState(snap || {})
  const ledgerRows = (ledger?.transactions || []).map(mapLedgerRow)
  /** Ledger API responded – use real rows even when count is 0 (do not mix mock rows with summary). */
  const ledgerOk = ledger?.status === 'ok'
  const hasPersistedLedger =
    ledgerOk &&
    ((ledger.total ?? 0) > 0 ||
      ledgerRows.length > 0 ||
      !!(
        appliedQ.trim() ||
        appliedFrom.trim() ||
        appliedTo.trim() ||
        appliedSource.trim() ||
        appliedTxnType.trim() ||
        appliedCategory.trim()
      ))
  const paytmRows = (paytm?.transactions || []).map((tx, i) => ({
    id: tx.id || `p-${i}`,
    date: new Date().toISOString().slice(0, 10),
    description: tx.description || 'Paytm',
    amount: tx.amount,
    type: tx.amount >= 0 ? 'credit' : 'debit',
    confidence: 0.91,
    source: tx.source || 'paytm',
    category: tx.category ?? '',
  }))
  const paytmRowsFiltered = paytmRows
    .filter((r) => rowMatchesDescription(r, appliedQ))
    .filter((r) => rowMatchesSource(r, appliedSource))
    .filter((r) => rowMatchesTxnType(r, appliedTxnType))
    .filter((r) => rowMatchesCategory(r, appliedCategory))
  const mockRowsFiltered = mockRows
    .filter((r) => rowMatchesDescription(r, appliedQ))
    .filter((r) => rowMatchesSource(r, appliedSource))
    .filter((r) => rowMatchesTxnType(r, appliedTxnType))
    .filter((r) => rowMatchesCategory(r, appliedCategory))

  const coreRows = ledgerOk
    ? paytmRowsFiltered.length
      ? [...paytmRowsFiltered, ...ledgerRows]
      : ledgerRows
    : paytmRowsFiltered.length
      ? [...paytmRowsFiltered, ...mockRowsFiltered.slice(0, 2)]
      : mockRowsFiltered

  const filtersActive = Boolean(
    appliedQ.trim() ||
      appliedFrom.trim() ||
      appliedTo.trim() ||
      appliedSource.trim() ||
      appliedTxnType.trim() ||
      appliedCategory.trim()
  )

  const rows = coreRows.length === 0 && !filtersActive && !ledgerOk ? mockRowsFiltered : coreRows

  const noSavedTransactions = ledgerSummary?.status === 'ok' && (ledgerSummary?.count ?? 0) === 0
  const showingMockInTable = !ledgerOk && rows.length > 0
  /** Orange banner: empty ledger (summary) or API unreachable so we show mock rows. */
  const showDemoExplainer = noSavedTransactions || showingMockInTable
  const spark = rows.slice(0, 8).map((r, i) => ({ i, v: Math.abs(r.amount) }))

  async function onExportLedger() {
    setExportBusy(true)
    setExportErr(null)
    try {
      const p = {}
      if (appliedFrom.trim()) p.date_from = appliedFrom.trim()
      if (appliedTo.trim()) p.date_to = appliedTo.trim()
      if (appliedQ.trim()) p.q = appliedQ.trim()
      if (appliedSource.trim()) p.source = appliedSource.trim()
      if (appliedTxnType.trim()) p.txn_type = appliedTxnType.trim()
      if (appliedSort && appliedSort !== LEDGER_SORT_DEFAULT) p.sort = appliedSort
      if (appliedCategory.trim()) p.category = appliedCategory.trim()
      await downloadLedgerCsv(p)
    } catch (e) {
      setExportErr(getApiErrorMessage(e))
    } finally {
      setExportBusy(false)
    }
  }

  function applyLedgerFilters() {
    setLoading(true)
    setLedgerOffset(0)
    const df = dateFrom.trim()
    const dt = dateTo.trim()
    const q = searchInput.trim()
    const src = sourceInput.trim()
    const tt = txnTypeInput.trim()
    const so = sortInput.trim() || LEDGER_SORT_DEFAULT
    const cat = categoryInput.trim()
    setAppliedFrom(df)
    setAppliedTo(dt)
    setAppliedQ(q)
    setAppliedSource(src)
    setAppliedTxnType(tt)
    setAppliedSort(so)
    setAppliedCategory(cat)
    const next = new URLSearchParams()
    if (df) next.set('date_from', df)
    if (dt) next.set('date_to', dt)
    if (q) next.set('q', q)
    if (src) next.set('source', src)
    if (tt) next.set('txn_type', tt)
    if (so !== LEDGER_SORT_DEFAULT) next.set('sort', so)
    if (cat) next.set('category', cat)
    setSearchParams(next, { replace: true })
    setLedgerRefresh((n) => n + 1)
  }

  function clearLedgerFilters() {
    setLoading(true)
    setLedgerOffset(0)
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSourceInput('')
    setTxnTypeInput('')
    setSortInput(LEDGER_SORT_DEFAULT)
    setCategoryInput('')
    setAppliedFrom('')
    setAppliedTo('')
    setAppliedQ('')
    setAppliedSource('')
    setAppliedTxnType('')
    setAppliedSort(LEDGER_SORT_DEFAULT)
    setAppliedCategory('')
    setSearchParams(new URLSearchParams(), { replace: true })
    setLedgerRefresh((n) => n + 1)
  }

  const ledgerTotal = ledger?.total
  const persistedRangeStart =
    ledgerTotal != null && ledgerTotal > 0
      ? ledgerOffset + 1
      : ledgerRows.length > 0
        ? ledgerOffset + 1
        : 0
  const persistedRangeEnd = ledgerOffset + ledgerRows.length
  const canLedgerPrev = ledgerOk && ledgerOffset > 0
  const canLedgerNext =
    ledgerOk &&
    ledgerTotal != null &&
    ledgerOffset + (ledger?.transactions?.length ?? 0) < ledgerTotal

  function goLedgerPrev() {
    if (!canLedgerPrev) return
    setLoading(true)
    setLedgerOffset((o) => Math.max(0, o - LEDGER_PAGE_SIZE))
  }

  function goLedgerNext() {
    if (!canLedgerNext) return
    setLoading(true)
    setLedgerOffset((o) => o + LEDGER_PAGE_SIZE)
  }

  const typeBadgeLabel = (r) => {
    if (r.type === 'credit') return t('जमा', 'credit')
    if (r.type === 'uncertain') return t('अनिश्चित', 'uncertain')
    return t('खर्च', 'debit')
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title={t('लेन-देन', 'Transactions')}
        subtitle={t(
          'SMS, बैंक, रेज़रपे और अपलोड से आपका लेजर – हर पंक्ति पर AI विश्वास स्तर। तारीख, स्रोत या विवरण से फ़िल्टर करें; निर्यात वही दिखाता है जो आप देखते हैं।',
          'Your ledger from SMS, bank, Razorpay, and uploads – with AI confidence on each line. Use filters to narrow by date, source, or description; export matches what you see (with the same filters).'
        )}
      >
        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:items-end">
          <div className="flex w-full min-w-0 flex-wrap items-end justify-end gap-x-2 gap-y-3">
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-from">
                {t('से', 'From')}
              </label>
              <input
                id="ledger-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-0.5 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-to">
                {t('तक', 'To')}
              </label>
              <input
                id="ledger-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-0.5 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-source">
                {t('स्रोत', 'Source')}
              </label>
              <select
                id="ledger-source"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                className="mt-0.5 min-w-[9rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              >
                {ledgerSourceOptions.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-category">
                {t('श्रेणी', 'Category')}
              </label>
              <select
                id="ledger-category"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
                title="GET /transactions/ledger?category="
              >
                {ledgerCategoryOptions.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-txn-type">
                {t('प्रकार', 'Type')}
              </label>
              <select
                id="ledger-txn-type"
                value={txnTypeInput}
                onChange={(e) => setTxnTypeInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              >
                {ledgerTxnTypeOptions.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-sort">
                {t('क्रम (सहेजा गया)', 'Sort (persisted)')}
              </label>
              <select
                id="ledger-sort"
                value={sortInput}
                onChange={(e) => setSortInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
                title="GET /transactions/ledger?sort="
              >
                {ledgerSortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 basis-full sm:basis-auto sm:min-w-[180px] sm:max-w-xs sm:flex-1">
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-q">
                {t('विवरण खोजें', 'Search description')}
              </label>
              <input
                id="ledger-q"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('UPI, व्यापारी…', 'UPI, merchant…')}
                maxLength={200}
                className="mt-0.5 w-full min-w-0 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950 placeholder:text-violet-400"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyLedgerFilters()}>
                {t('लागू करें', 'Apply')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => clearLedgerFilters()}>
                {t('साफ़ करें', 'Clear')}
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading || exportBusy}
            onClick={() => void onExportLedger()}
            title="GET /transactions/ledger/export"
          >
            {exportBusy ? t('तैयार हो रहा…', 'Preparing…') : t('लेजर CSV निर्यात', 'Export ledger CSV')}
          </Button>
          {exportErr && <p className="max-w-xs text-right text-xs text-red-600">{exportErr}</p>}
        </div>
      </PageHeader>
      <details className="mb-6 rounded-xl border border-violet-200/60 bg-violet-50/40 px-4 py-3 text-sm text-violet-800/90">
        <summary className="cursor-pointer font-medium text-violet-950">
          {t('तकनीकी विवरण (API और क्वेरी)', 'Technical details (API & query params)')}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-violet-950/75">
          {t(
            'फ़िल्टर URL में सिंक होते हैं। डेटा GET /transactions/ledger से पेजिनेशन (200 पंक्तियाँ), sort=, txn_type=, category= के साथ आता है। योग GET /transactions/ledger/summary से। Paytm पंक्तियाँ ब्राउज़र में मिलती हैं। CSV वही फ़िल्टर लागू करता है।',
            'Filters sync to the URL for sharing. Persisted data uses GET /transactions/ledger with pagination (200 rows per page), sort=, txn_type=, and category=. Totals use GET /transactions/ledger/summary over the full filtered set. Paytm rows are merged in the browser when connected. CSV export applies the same filters as the table.'
          )}
        </p>
      </details>
      {!loading && ledgerOk && (
        <p className="mb-4 text-sm text-emerald-800/90">
          {t('दिखा रहे हैं', 'Showing')} {ledgerRows.length}{' '}
          {ledgerRows.length === 1 ? t('पंक्ति', 'row') : t('पंक्तियाँ', 'rows')}
          {ledger?.total != null && (
            <>
              {' '}
              ({ledger.total}{' '}
              {appliedFrom || appliedTo || appliedQ || appliedSource || appliedTxnType || appliedCategory
                ? t('फ़िल्टर मेल', 'matching filters')
                : t('कुल डेटाबेस में', 'total in database')}
              {ledger.total > ledgerRows.length
                ? ` – ${t('पेज', 'page')} ${persistedRangeStart}–${persistedRangeEnd} (${t('ऑफ़सेट', 'offset')} ${ledgerOffset})`
                : ''})
            </>
          )}
          {(appliedFrom || appliedTo) && (
            <span className="text-violet-800/90">
              {' '}
              · {appliedFrom || '…'} → {appliedTo || '…'} ({t('UTC दिन सीमा', 'UTC day bounds')})
            </span>
          )}
          {appliedQ && (
            <span className="text-violet-800/90">{` · ${t('खोज', 'search')} '${appliedQ}'`}</span>
          )}
          {appliedSource && (
            <span className="text-violet-800/90">{` · ${t('स्रोत', 'source')} ${formatSource(appliedSource)}`}</span>
          )}
          {appliedCategory && (
            <span className="text-violet-800/90">{` · ${t('श्रेणी', 'category')} ${formatCategory(appliedCategory)}`}</span>
          )}
          {appliedTxnType && (
            <span className="text-violet-800/90">
              {` · ${
                appliedTxnType === 'credit' ? t('केवल जमा', 'credits only') : t('केवल खर्च', 'debits only')
              }`}
            </span>
          )}
          {appliedSort !== LEDGER_SORT_DEFAULT && (
            <span className="text-violet-800/90">
              {' '}
              · {t('क्रम:', 'sort:')}{' '}
              {ledgerSortOptions.find((o) => o.value === appliedSort)?.label ?? appliedSort} ({t('सहेजी पंक्तियाँ', 'persisted rows')})
            </span>
          )}
          {paytmRowsFiltered.length
            ? appliedQ.trim()
              ? ` · ${t('Paytm डेमो पंक्तियाँ ऊपर (खोज Paytm को भी फ़िल्टर करती है)', 'Paytm mock rows above them (search also filters Paytm in the browser)')}`
              : ` · ${t('Paytm डेमो पंक्तियाँ ऊपर', 'Paytm mock rows above them')}`
            : ''}
          .
        </p>
      )}
      {showDemoExplainer && (
        <div className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm">
          <p className="font-medium text-amber-950">
            {noSavedTransactions
              ? t('डेटाबेस में अभी कोई लेन-देन नहीं', 'No transactions in your database yet')
              : t('उदाहरण लेन-देन (डेमो)', 'Example transactions (demo)')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/85">
            {noSavedTransactions
              ? t(
                  'अपना लेजर भरने के लिए: `backend` में `python scripts/seed_mock_data.py` चलाएँ, या सिर्फ़ CSV से `python scripts/load_mock_csv_to_ledger.py` (फिर demo@example.com से लॉग इन)। मॉक फ़ाइल: `backend/data/mock_transactions.csv`।',
                  'To populate your ledger: run `python scripts/seed_mock_data.py` from `backend`, or load mock CSV only with `python scripts/load_mock_csv_to_ledger.py`, then log in as demo@example.com. Sample file: `backend/data/mock_transactions.csv`.'
                )
              : t(
                  'API लोड नहीं हो सका या आप लॉग इन नहीं हैं – नीचे नमूना पंक्तियाँ दिख रही हैं। लाइव डेटा के लिए API कनेक्ट करें।',
                  'The API could not load or you are not logged in – the table below shows sample rows. Connect the API for live data.'
                )}
          </p>
        </div>
      )}
      {!loading && ledgerSummary?.status === 'ok' && (
        <Card className="mb-6 border border-teal-200/60 bg-gradient-to-br from-white to-teal-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('लेजर योग (आपके डेटाबेस में सहेजा)', 'Ledger totals (saved in your database)')}
            </CardTitle>
            <p className="text-xs font-normal text-violet-950/65">
              {t(
                'ऊपर की तारीख सीमा और फ़िल्टर से मेल खाता है। गिनती और योग पूरे फ़िल्टर सेट के लिए हैं, सिर्फ़ इस पेज के नहीं। तालिका में डेमो पंक्तियाँ यहाँ शामिल नहीं।',
                'Matches the date range and filters above. Counts and sums are for the full filtered set, not just this page. Demo / sample rows in the table are not included here.'
              )}
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 normal-case">
                  {t('पंक्तियाँ', 'Rows')}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-violet-950">{ledgerSummary.count}</dd>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 normal-case">
                  {t('आगमन (जमा)', 'Inflows (credit)')}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
                  {formatInr(ledgerSummary.total_credit)}
                </dd>
              </div>
              <div className="rounded-xl border border-rose-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 normal-case">
                  {t('निकास (खर्च)', 'Outflows (debit)')}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-900">
                  {formatInr(ledgerSummary.total_debit)}
                </dd>
              </div>
              <div className="rounded-xl border border-violet-200 bg-white/90 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 normal-case">
                  {t('शुद्ध (आ − जा)', 'Net (in − out)')}
                </dt>
                <dd
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    ledgerSummary.net >= 0 ? 'text-emerald-800' : 'text-rose-800'
                  )}
                >
                  {formatInr(ledgerSummary.net)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>{t('गतिविधि नाड़ी', 'Activity pulse')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6C3BFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(108,59,255,0.2)' }}
                    formatter={(v) => [formatInr(v), t('राशि', 'Amount')]}
                  />
                  <Area type="monotone" dataKey="v" stroke="#6C3BFF" fill="url(#txFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('अंतर्दृष्टि', 'Insight')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-violet-950/70">
            {snap?.risk != null && (
              <p>
                {t('मॉडल अनुमान', 'Model estimates')}{' '}
                <span className="font-semibold text-violet-900">{(100 * snap.risk).toFixed(1)}%</span>{' '}
                {t(
                  'नकद तनाव – अनिश्चित टैग मिलाएँ ताकि विश्वास बढ़े।',
                  'cash stress in horizon – reconcile uncertain tags to improve confidence.'
                )}
              </p>
            )}
            {!snap && !loading && (
              <p>
                {t(
                  'Paytm (डैशबोर्ड), प्रोफ़ाइल से बैंक लिंक, या Razorpay – वेबहुक से भुगतान लेजर में आते हैं जब कॉन्फ़िगर हो।',
                  'Connect Paytm (dashboard), link your bank under Profile, or collect via Razorpay – webhook payments post to the ledger automatically when configured.'
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <CardTitle>{t('हाल की पंक्तियाँ', 'Recent lines')}</CardTitle>
            {showingMockInTable && (
              <p className="mt-1 text-xs font-medium text-amber-800/90">
                {t('डेमो डेटा दिख रहा है – लाइव बैंक फ़ीड नहीं', 'Showing demo data – not your live bank feed')}
              </p>
            )}
          </div>
          {ledgerOk && ledgerTotal != null && ledgerTotal > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tabular-nums text-violet-600">
                {t('सहेजी पंक्तियाँ', 'Persisted rows')} {persistedRangeStart}–{persistedRangeEnd} {t('का', 'of')}{' '}
                {ledgerTotal} ({LEDGER_PAGE_SIZE} / {t('पृष्ठ', 'page')})
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canLedgerPrev || loading}
                  onClick={() => goLedgerPrev()}
                >
                  {t('पिछला', 'Previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canLedgerNext || loading}
                  onClick={() => goLedgerNext()}
                >
                  {t('अगला', 'Next')}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-100 bg-violet-50/40 text-xs uppercase tracking-wide text-violet-600">
                <th className="px-4 py-3 normal-case">{t('तारीख', 'Date')}</th>
                <th className="px-4 py-3 normal-case">{t('विवरण', 'Description')}</th>
                <th className="px-4 py-3 normal-case">{t('स्रोत', 'Source')}</th>
                <th className="px-4 py-3 normal-case">{t('श्रेणी', 'Category')}</th>
                <th className="px-4 py-3 normal-case">{t('प्रकार', 'Type')}</th>
                <th className="px-4 py-3 text-right normal-case">{t('राशि', 'Amount')}</th>
                <th className="px-4 py-3 normal-case">{t('विश्वास', 'Confidence')}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-violet-50">
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-violet-600">
                        {filtersActive
                          ? t(
                              'इन फ़िल्टर से कोई लेन-देन नहीं मिला। फ़िल्टर साफ़ करें या तारीख बढ़ाएँ।',
                              'No transactions match these filters. Clear filters or widen the date range.'
                            )
                          : ledgerOk
                            ? t(
                                'अभी कोई सहेजी पंक्ति नहीं। डेमो: `python scripts/seed_mock_data.py` या `python scripts/load_mock_csv_to_ledger.py` – `backend/data/mock_transactions.csv`।',
                                'No saved rows yet. Run `python scripts/seed_mock_data.py` or `python scripts/load_mock_csv_to_ledger.py` using `backend/data/mock_transactions.csv`.'
                              )
                            : t(
                                'लेजर लोड नहीं हो सका। लॉग इन करें और API कनेक्ट करें।',
                                'Could not load ledger. Log in and ensure the API is reachable.'
                              )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-b border-violet-50/80 hover:bg-violet-50/30">
                        <td className="px-4 py-3 tabular-nums text-violet-950/80">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {r.date}
                            {r.demo ? (
                              <Badge variant="warning" className="text-[10px] font-semibold uppercase">
                                {t('डेमो', 'Demo')}
                              </Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-violet-950">{r.description}</td>
                        <td className="px-4 py-3 text-xs text-violet-700/90">{formatSource(r.source)}</td>
                        <td className="px-4 py-3 text-xs capitalize text-violet-700/85">{formatCategory(r.category)}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              r.type === 'credit' ? 'success' : r.type === 'uncertain' ? 'warning' : 'danger'
                            }
                            className="capitalize"
                          >
                            {typeBadgeLabel(r)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-violet-950">
                          {formatInr(r.amount)}
                        </td>
                        <td className="px-4 py-3 w-40">
                          <div className="flex items-center gap-2">
                            <Progress value={(r.confidence || 0) * 100} className="flex-1" />
                            <span className="text-xs text-violet-600">{((r.confidence || 0) * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
